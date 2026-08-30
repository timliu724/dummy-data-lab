import { createRelationshipRule } from '../core/contracts.js';
import { normalizeHeader } from '../detection/header-normalization.js';

const JOINT_ACTIONS = new Set(['KEEP', 'RESAMPLE']);
const NUMERIC_TYPES = new Set(['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE']);
const MAPPING_ACTIONS = new Set(['REPLACE', 'PATTERN_REPLACE']);
const MIN_SUPPORT = 20;
const MAX_FUNCTIONAL_VALUES = 256;
const MAX_PUBLIC_LOCATION_VALUES = 10_000;

function text(value) {
  return String(value ?? '').trim();
}

function finiteNumber(value) {
  const parsed = Number(text(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function semanticFamily(columnName) {
  const tokens = normalizeHeader(columnName).split('_').filter(Boolean);
  const first = tokens.find((token) => token.length >= 3 && !['the', 'value', 'amount', 'number'].includes(token));
  return first ?? '';
}

function addBounded(set, value) {
  if (set.size <= MAX_FUNCTIONAL_VALUES) set.add(value);
}

function observeMapping(map, key, value, state, conflictKey, overflowKey) {
  if (map.has(key)) {
    if (map.get(key) !== value) state[conflictKey] = true;
    return;
  }
  if (map.size >= MAX_FUNCTIONAL_VALUES) {
    state[overflowKey] = true;
    return;
  }
  map.set(key, value);
}

function createFunctionalState(left, right) {
  return {
    left,
    right,
    support: 0,
    leftValues: new Set(),
    rightValues: new Set(),
    leftToRight: new Map(),
    rightToLeft: new Map(),
    leftConflict: false,
    rightConflict: false,
    leftOverflow: false,
    rightOverflow: false,
  };
}

function updateFunctional(state, row) {
  const left = text(row[state.left]);
  const right = text(row[state.right]);
  if (!left || !right) return;
  state.support += 1;
  addBounded(state.leftValues, left);
  addBounded(state.rightValues, right);
  observeMapping(state.leftToRight, left, right, state, 'leftConflict', 'leftOverflow');
  observeMapping(state.rightToLeft, right, left, state, 'rightConflict', 'rightOverflow');
}

function createNumericState(left, right) {
  return { left, right, support: 0, leftLessOrEqual: 0, rightLessOrEqual: 0 };
}

function updateNumeric(state, row) {
  const left = finiteNumber(row[state.left]);
  const right = finiteNumber(row[state.right]);
  if (left === null || right === null) return;
  state.support += 1;
  if (left <= right) state.leftLessOrEqual += 1;
  if (right <= left) state.rightLessOrEqual += 1;
}

function createSameIdState(left, right) {
  return { left, right, support: 0, matches: 0, first: null, distinct: false };
}

function updateSameId(state, row) {
  const left = text(row[state.left]);
  const right = text(row[state.right]);
  if (!left || !right) return;
  state.support += 1;
  if (left !== right) return;
  state.matches += 1;
  if (state.first === null) state.first = left;
  else if (left !== state.first) state.distinct = true;
}

function createDerivedState(source, target) {
  return {
    source,
    target,
    support: 0,
    prefixMatches: 0,
    urlMatches: 0,
    separatorCounts: new Map(),
  };
}

function updateDerived(state, row) {
  const source = text(row[state.source]);
  const target = text(row[state.target]);
  if (!source || !target) return;
  state.support += 1;
  for (const separator of ['_', '-', '.', '/']) {
    if (target.startsWith(source + separator)) {
      state.prefixMatches += 1;
      state.separatorCounts.set(separator, (state.separatorCounts.get(separator) ?? 0) + 1);
      break;
    }
  }
  if (/^https?:\/\//i.test(target) && target.includes(source)) state.urlMatches += 1;
}

function createPublicLocationState(stateColumnIndex, postcodeColumnIndex) {
  return {
    stateColumnIndex,
    postcodeColumnIndex,
    support: 0,
    conflict: false,
    overflow: false,
    postcodeToState: new Map(),
  };
}

function updatePublicLocation(state, row) {
  const postcode = text(row[state.postcodeColumnIndex]);
  const region = text(row[state.stateColumnIndex]);
  if (!postcode || !region) return;
  state.support += 1;
  if (state.postcodeToState.has(postcode)) {
    if (state.postcodeToState.get(postcode) !== region) state.conflict = true;
    return;
  }
  if (state.postcodeToState.size >= MAX_PUBLIC_LOCATION_VALUES) {
    state.overflow = true;
    return;
  }
  state.postcodeToState.set(postcode, region);
}

function connectedComponents(edges) {
  const parent = new Map();
  const find = (value) => {
    const current = parent.get(value) ?? value;
    if (current === value) {
      parent.set(value, value);
      return value;
    }
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const edge of edges) join(edge.left, edge.right);
  const groups = new Map();
  for (const value of parent.keys()) {
    const root = find(value);
    const group = groups.get(root) ?? [];
    group.push(value);
    groups.set(root, group);
  }
  return [...groups.values()].map((group) => group.sort((left, right) => left - right));
}

export function createJointSourceEvidenceProfiler({
  headers = [],
  detections = [],
  policies = [],
  profiles = [],
} = {}) {
  let observedRowCount = 0;
  const functionalIndexes = policies.flatMap((policy, columnIndex) => {
    const profile = profiles[columnIndex] ?? {};
    const uniqueCount = profile.uniqueCount;
    const suitableCardinality = Number.isInteger(uniqueCount)
      && uniqueCount >= 2
      && uniqueCount <= MAX_FUNCTIONAL_VALUES;
    return JOINT_ACTIONS.has(policy?.selectedAction)
      && (suitableCardinality || detections[columnIndex]?.type === 'BOOLEAN')
      ? [columnIndex]
      : [];
  });
  const functionalStates = [];
  for (let leftOffset = 0; leftOffset < functionalIndexes.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < functionalIndexes.length; rightOffset += 1) {
      const left = functionalIndexes[leftOffset];
      const right = functionalIndexes[rightOffset];
      if (policies[left]?.selectedAction === 'KEEP' && policies[right]?.selectedAction === 'KEEP') continue;
      functionalStates.push(createFunctionalState(left, right));
    }
  }

  const numericIndexes = policies.flatMap((policy, columnIndex) => (
    policy?.selectedAction === 'RESAMPLE' && NUMERIC_TYPES.has(detections[columnIndex]?.type)
      ? [columnIndex]
      : []
  ));
  const numericStates = [];
  for (let leftOffset = 0; leftOffset < numericIndexes.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < numericIndexes.length; rightOffset += 1) {
      const left = numericIndexes[leftOffset];
      const right = numericIndexes[rightOffset];
      const family = semanticFamily(headers[left]);
      if (!family || family !== semanticFamily(headers[right])) continue;
      numericStates.push(createNumericState(left, right));
    }
  }

  const replacementIndexes = policies.flatMap((policy, columnIndex) => (
    MAPPING_ACTIONS.has(policy?.selectedAction) ? [columnIndex] : []
  ));
  const mappingIndexes = replacementIndexes.filter((columnIndex) => (
    policies[columnIndex]?.attributeRole === 'DIRECT_IDENTIFIER'
  ));
  const derivedStates = [];
  for (const source of replacementIndexes) {
    for (const target of replacementIndexes) {
      if (source !== target) derivedStates.push(createDerivedState(source, target));
    }
  }
  const stateColumnIndex = headers.findIndex((header) => /^(state|province|territory)$/u.test(normalizeHeader(header)));
  const postcodeColumnIndex = headers.findIndex((header) => /^(postcode|post_code|postal_code|zip|zip_code)$/u.test(normalizeHeader(header)));
  const publicLocationState = stateColumnIndex >= 0
    && postcodeColumnIndex >= 0
    && policies[stateColumnIndex]?.selectedAction === 'RESAMPLE'
    && policies[postcodeColumnIndex]?.selectedAction === 'REPLACE'
    ? createPublicLocationState(stateColumnIndex, postcodeColumnIndex)
    : null;
  const sameIdStates = [];
  for (let leftOffset = 0; leftOffset < mappingIndexes.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < mappingIndexes.length; rightOffset += 1) {
      sameIdStates.push(createSameIdState(mappingIndexes[leftOffset], mappingIndexes[rightOffset]));
    }
  }

  return Object.freeze({
    update(row) {
      observedRowCount += 1;
      for (const state of functionalStates) updateFunctional(state, row);
      for (const state of numericStates) updateNumeric(state, row);
      for (const state of sameIdStates) updateSameId(state, row);
      for (const state of derivedStates) updateDerived(state, row);
      if (publicLocationState) updatePublicLocation(publicLocationState, row);
    },
    finalize() {
      const edges = [];
      for (const state of functionalStates) {
        const leftDistinct = state.leftValues.size;
        const rightDistinct = state.rightValues.size;
        const bounded = !state.leftOverflow && !state.rightOverflow;
        const functional = bounded && (!state.leftConflict || !state.rightConflict);
        if (state.support < MIN_SUPPORT || leftDistinct < 2 || rightDistinct < 2 || !functional) continue;
        edges.push(Object.freeze({
          left: state.left,
          right: state.right,
          kind: 'FUNCTIONAL_DEPENDENCY',
          support: state.support,
          evidence: 'A deterministic source-row mapping was observed across ' + state.support.toLocaleString() + ' complete records.',
        }));
      }
      for (const state of numericStates) {
        if (state.support < MIN_SUPPORT) continue;
        const strongest = Math.max(state.leftLessOrEqual, state.rightLessOrEqual) / state.support;
        if (strongest < 0.995) continue;
        edges.push(Object.freeze({
          left: state.left,
          right: state.right,
          kind: 'NUMERIC_ORDER',
          support: state.support,
          evidence: 'A consistent numeric order was observed in ' + (strongest * 100).toFixed(1) + '% of ' + state.support.toLocaleString() + ' complete records.',
        }));
      }
      if (publicLocationState
        && publicLocationState.support >= MIN_SUPPORT
        && !publicLocationState.conflict
        && !publicLocationState.overflow
        && publicLocationState.postcodeToState.size >= 2) {
        edges.push(Object.freeze({
          left: publicLocationState.stateColumnIndex,
          right: publicLocationState.postcodeColumnIndex,
          kind: 'EVIDENCE_BACKED_TUPLE',
          support: publicLocationState.support,
          evidence: 'Every observed postcode mapped to one state across ' + publicLocationState.support.toLocaleString() + ' complete records.',
        }));
      }

      const groups = connectedComponents(edges).map((columnIndexes, groupIndex) => {
        const groupEdges = edges.filter((edge) => columnIndexes.includes(edge.left) && columnIndexes.includes(edge.right));
        return Object.freeze({
          id: 'auto-joint-source-' + (groupIndex + 1),
          columnIndexes: Object.freeze(columnIndexes),
          columnNames: Object.freeze(columnIndexes.map((index) => headers[index])),
          support: Math.min(...groupEdges.map((edge) => edge.support)),
          evidence: Object.freeze([...new Set(groupEdges.map((edge) => edge.evidence))]),
          source: 'ROW_EVIDENCE',
        });
      });

      const sameIdRules = sameIdStates.flatMap((state) => {
        if (state.support < MIN_SUPPORT || state.matches !== state.support || !state.distinct) return [];
        const leftName = headers[state.left];
        const rightName = headers[state.right];
        const id = 'auto-evidence:same-id:' + state.left + ':' + state.right;
        return [createRelationshipRule({
          id,
          kind: 'SAME_ID',
          columnNames: [leftName, rightName],
          confidence: 'HIGH',
          confidenceScore: 1,
          support: state.support,
          status: 'CONFIRMED',
          enabled: true,
          evidence: [leftName + ' and ' + rightName + ' contained the same non-empty identifier in all ' + state.support.toLocaleString() + ' complete source records.'],
          source: 'DETECTED',
          mappingScope: id,
          reviewRequired: false,
          options: { sourceEvidence: 'EXACT_EQUALITY' },
        })];
      });
      const derivedRules = derivedStates.flatMap((state) => {
        if (state.support < MIN_SUPPORT) return [];
        const tableCoverage = observedRowCount > 0 ? state.support / observedRowCount : 0;
        if (tableCoverage < 0.8) return [];
        const prefixScore = state.prefixMatches / state.support;
        const urlScore = state.urlMatches / state.support;
        const sourceName = headers[state.source];
        const targetName = headers[state.target];
        if (urlScore >= 0.995) {
          const id = 'auto-evidence:url-contains-id:' + state.source + ':' + state.target;
          return [createRelationshipRule({
            id,
            kind: 'URL_CONTAINS_ID',
            columnNames: [sourceName, targetName],
            confidence: 'HIGH',
            confidenceScore: urlScore,
            support: state.support,
            status: 'CONFIRMED',
            enabled: true,
            evidence: [targetName + ' was a URL containing the same-row ' + sourceName + ' in ' + state.urlMatches.toLocaleString() + ' of ' + state.support.toLocaleString() + ' complete records.'],
            source: 'DETECTED',
            reviewRequired: false,
            options: { sourceColumnName: sourceName, targetColumnName: targetName, extension: '.png' },
          })];
        }
        if (prefixScore < 0.995) return [];
        const separator = [...state.separatorCounts.entries()]
          .sort((left, right) => right[1] - left[1])[0]?.[0] ?? '_';
        const id = 'auto-evidence:prefix:' + state.source + ':' + state.target;
        return [createRelationshipRule({
          id,
          kind: 'PREFIX_DEPENDENCY',
          columnNames: [sourceName, targetName],
          confidence: 'HIGH',
          confidenceScore: prefixScore,
          support: state.support,
          status: 'CONFIRMED',
          enabled: true,
          evidence: [targetName + ' began with the same-row ' + sourceName + ' in ' + state.prefixMatches.toLocaleString() + ' of ' + state.support.toLocaleString() + ' complete records.'],
          source: 'DETECTED',
          reviewRequired: false,
          options: { sourceColumnName: sourceName, targetColumnName: targetName, separator },
        })];
      });
      const autoRelationshipRules = Object.freeze([...sameIdRules, ...derivedRules]);

      return Object.freeze({
        groups: Object.freeze(groups),
        autoRelationshipRules,
      });
    },
  });
}
