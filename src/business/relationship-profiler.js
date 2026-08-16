import { createRelationshipRule } from '../core/contracts.js';

const NUMERIC_TYPES = new Set(['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE']);
const TRUE_TOKENS = new Set(['true', 'yes', 'y', '1', 'on', 'available', 'in stock']);
const FALSE_TOKENS = new Set(['false', 'no', 'n', '0', 'off', 'unavailable', 'out of stock']);
const RELATIONSHIP_NUMERIC_ACTIONS = new Set(['KEEP', 'RESAMPLE']);
const RELATIONSHIP_TARGET_ACTIONS = new Set(['RESAMPLE']);
const BOOLEAN_RELATIONSHIP_TARGET_ACTIONS = new Set(['RESAMPLE', 'REPLACE']);

export function parseBusinessNumber(value) {
  const source = String(value ?? '').trim();
  if (!source) return null;
  const negative = /^\(.*\)$/.test(source);
  const cleaned = source.replace(/[,$£€¥%()\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : null;
}

function booleanValue(value) {
  const token = String(value ?? '').trim().toLocaleLowerCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  return null;
}

function close(left, right) {
  return Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
}

function columnPriority(header) {
  const text = String(header ?? '').toLocaleLowerCase();
  let score = 0;
  if (/price|qty|quantity|amount|total|cost|stock|balance|count|rate|percent|shipping/.test(text)) score += 10;
  if (/available|status|active|enabled/.test(text)) score += 6;
  return score;
}

export function businessNumericColumnIndexes({ headers, detections, policies = [], maxNumericColumns = 24 } = {}) {
  return headers.map((header, index) => ({ index, score: columnPriority(header) }))
    .filter(({ index }) => NUMERIC_TYPES.has(detections[index]?.type)
      && (!policies[index] || RELATIONSHIP_NUMERIC_ACTIONS.has(policies[index].selectedAction)))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxNumericColumns)
    .map(({ index }) => index);
}

function mutableTarget(left, right, policies) {
  const rightMutable = RELATIONSHIP_TARGET_ACTIONS.has(policies[right]?.selectedAction);
  const leftMutable = RELATIONSHIP_TARGET_ACTIONS.has(policies[left]?.selectedAction);
  if (rightMutable) return { sourceColumnIndex: left, targetColumnIndex: right };
  if (leftMutable) return { sourceColumnIndex: right, targetColumnIndex: left };
  return null;
}

export function createBusinessRelationshipProfiler({
  headers,
  detections,
  policies,
  maxNumericColumns = 24,
  maxBooleanColumns = 16,
} = {}) {
  if (!Array.isArray(headers) || !Array.isArray(detections) || !Array.isArray(policies)) {
    throw new TypeError('headers, detections, and policies are required.');
  }
  const ranked = headers.map((header, index) => ({ index, score: columnPriority(header) }));
  const numericIndexes = businessNumericColumnIndexes({ headers, detections, policies, maxNumericColumns });
  const booleanIndexes = ranked
    .filter(({ index }) => detections[index]?.type === 'BOOLEAN')
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxBooleanColumns)
    .map(({ index }) => index);

  const numericPairs = [];
  for (let leftOffset = 0; leftOffset < numericIndexes.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < numericIndexes.length; rightOffset += 1) {
      numericPairs.push({
        left: numericIndexes[leftOffset],
        right: numericIndexes[rightOffset],
        support: 0,
        equal: 0,
        difference: null,
        differenceMatches: 0,
        ratio: null,
        ratioMatches: 0,
      });
    }
  }
  const thresholdPairs = booleanIndexes.flatMap((booleanIndex) => numericIndexes.map((numericIndex) => ({
    numericIndex,
    booleanIndex,
    support: 0,
    matches: 0,
    trueValue: null,
    falseValue: null,
  })));
  let rowCount = 0;

  return Object.freeze({
    numericColumnIndexes: Object.freeze([...numericIndexes]),
    update(row) {
      rowCount += 1;
      for (const pair of numericPairs) {
        const left = parseBusinessNumber(row[pair.left]);
        const right = parseBusinessNumber(row[pair.right]);
        if (left === null || right === null) continue;
        pair.support += 1;
        if (close(left, right)) pair.equal += 1;
        const difference = right - left;
        if (pair.difference === null) pair.difference = difference;
        if (close(difference, pair.difference)) pair.differenceMatches += 1;
        if (!close(left, 0)) {
          const ratio = right / left;
          if (pair.ratio === null) pair.ratio = ratio;
          if (close(ratio, pair.ratio)) pair.ratioMatches += 1;
        }
      }
      for (const pair of thresholdPairs) {
        const numeric = parseBusinessNumber(row[pair.numericIndex]);
        const boolean = booleanValue(row[pair.booleanIndex]);
        if (numeric === null || boolean === null) continue;
        pair.support += 1;
        if ((numeric > 0) === boolean) pair.matches += 1;
        if (boolean && pair.trueValue === null) pair.trueValue = String(row[pair.booleanIndex]);
        if (!boolean && pair.falseValue === null) pair.falseValue = String(row[pair.booleanIndex]);
      }
    },
    finalize({ minimumSupport = Math.max(3, Math.min(20, Math.ceil(rowCount * 0.1))), confidence = 0.995 } = {}) {
      const rules = [];
      for (const pair of numericPairs) {
        if (pair.support < minimumSupport) continue;
        const direction = mutableTarget(pair.left, pair.right, policies);
        if (!direction) continue;
        const details = {
          sourceColumnIndex: direction.sourceColumnIndex,
          targetColumnIndex: direction.targetColumnIndex,
          sourceColumnName: headers[direction.sourceColumnIndex],
          targetColumnName: headers[direction.targetColumnIndex],
          support: pair.support,
        };
        if (pair.equal / pair.support >= confidence) {
          rules.push(Object.freeze({ kind: 'NUMERIC_EQUAL', ...details, confidence: pair.equal / pair.support }));
        } else if (pair.differenceMatches / pair.support >= confidence && !close(pair.difference, 0)) {
          const signedDifference = direction.sourceColumnIndex === pair.left ? pair.difference : -pair.difference;
          rules.push(Object.freeze({ kind: 'NUMERIC_DIFFERENCE', ...details, value: signedDifference, confidence: pair.differenceMatches / pair.support }));
        } else if (pair.ratioMatches / pair.support >= confidence && pair.ratio !== null && !close(pair.ratio, 1)) {
          const signedRatio = direction.sourceColumnIndex === pair.left ? pair.ratio : 1 / pair.ratio;
          rules.push(Object.freeze({ kind: 'NUMERIC_RATIO', ...details, value: signedRatio, confidence: pair.ratioMatches / pair.support }));
        }
      }
      for (const pair of thresholdPairs) {
        if (pair.support < minimumSupport || pair.matches / pair.support < confidence) continue;
        if (pair.trueValue === null || pair.falseValue === null) continue;
        if (BOOLEAN_RELATIONSHIP_TARGET_ACTIONS.has(policies[pair.booleanIndex]?.selectedAction)) {
          rules.push(Object.freeze({
            kind: 'BOOLEAN_FROM_POSITIVE',
            sourceColumnIndex: pair.numericIndex,
            targetColumnIndex: pair.booleanIndex,
            sourceColumnName: headers[pair.numericIndex],
            targetColumnName: headers[pair.booleanIndex],
            trueValue: pair.trueValue ?? 'true',
            falseValue: pair.falseValue ?? 'false',
            support: pair.support,
            confidence: pair.matches / pair.support,
          }));
        } else if (RELATIONSHIP_TARGET_ACTIONS.has(policies[pair.numericIndex]?.selectedAction)) {
          rules.push(Object.freeze({
            kind: 'POSITIVE_FROM_BOOLEAN',
            sourceColumnIndex: pair.booleanIndex,
            targetColumnIndex: pair.numericIndex,
            sourceColumnName: headers[pair.booleanIndex],
            targetColumnName: headers[pair.numericIndex],
            support: pair.support,
            confidence: pair.matches / pair.support,
          }));
        }
      }
      const priority = { BOOLEAN_FROM_POSITIVE: 4, POSITIVE_FROM_BOOLEAN: 4, NUMERIC_EQUAL: 3, NUMERIC_DIFFERENCE: 2, NUMERIC_RATIO: 1 };
      const selectedTargets = new Set();
      const selectedRules = rules
        .sort((left, right) => priority[right.kind] - priority[left.kind]
          || right.confidence - left.confidence
          || right.support - left.support)
        .filter((rule) => {
          if (selectedTargets.has(rule.targetColumnIndex)) return false;
          selectedTargets.add(rule.targetColumnIndex);
          return true;
        });
      const candidates = selectedRules.map((rule) => {
        const { confidence: confidenceScore, support, ...options } = rule;
        const confidence = confidenceScore >= 0.999 ? 'HIGH' : confidenceScore >= 0.95 ? 'MEDIUM' : 'LOW';
        const percentage = (confidenceScore * 100).toFixed(confidenceScore >= 0.999 ? 1 : 2).replace(/\.0$/, '');
        return createRelationshipRule({
          id: `candidate:business:${rule.kind.toLocaleLowerCase()}:${rule.sourceColumnIndex}:${rule.targetColumnIndex}`,
          kind: rule.kind,
          columnNames: [rule.sourceColumnName, rule.targetColumnName],
          confidence,
          confidenceScore,
          support,
          status: 'CANDIDATE',
          enabled: false,
          evidence: [`${support.toLocaleString()} supported source rows matched this rule at ${percentage}% confidence.`],
          source: 'DETECTED',
          reviewRequired: true,
          options,
        });
      });
      return Object.freeze({
        rowCount,
        inspectedNumericColumnCount: numericIndexes.length,
        inspectedBooleanColumnCount: booleanIndexes.length,
        rules: Object.freeze(candidates),
      });
    },
  });
}
