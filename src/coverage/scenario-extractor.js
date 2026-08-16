import { createContractWarning, createCoverageScenario, relationshipIsActive } from '../core/contracts.js';
import { parseTemporalValue } from '../detection/date-time.js';
import { valueShape } from '../detection/pattern-utils.js';
import { parseNumericToken } from '../profile/value-normalization.js';

export const DEFAULT_SCENARIO_LIMITS = Object.freeze({
  maxScenarios: 1000,
  maxCommonCategoriesPerColumn: 3,
  maxRareCategoriesPerColumn: 2,
  maxPatternsPerColumn: 3,
});

/** @param {string} value */
function booleanClass(value) {
  const normalized = value.trim().toLocaleLowerCase();
  if (['true', 'yes', 'y', '1', 'on'].includes(normalized)) return 'TRUE_LIKE';
  if (['false', 'no', 'n', '0', 'off'].includes(normalized)) return 'FALSE_LIKE';
  return null;
}

/** @param {string} value */
function temporalOrderKey(value) {
  const text = value.trim();
  let match = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) return +`${match[1]}${match[2]}${match[3]}`;
  match = text.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  if (match) return +`${match[3]}${match[2]}${match[1]}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const first = +match[1];
    const second = +match[2];
    if (first > 12) return +`${match[3]}${String(second).padStart(2, '0')}${String(first).padStart(2, '0')}`;
    if (second > 12) return +`${match[3]}${String(first).padStart(2, '0')}${String(second).padStart(2, '0')}`;
  }
  match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) return +match[1] * 3600 + +match[2] * 60 + +(match[3] ?? 0);
  return null;
}

/**
 * Creates public scenarios plus private row matchers. Category values used by
 * matchers are captured in closures and never copied into the public scenario.
 *
 * @param {Object} values
 * @param {object} values.tableProfile
 * @param {object[]} values.detections
 * @param {object[]} [values.relationships]
 * @param {Partial<typeof DEFAULT_SCENARIO_LIMITS>} [values.limits]
 */
export function extractCoverageScenarios({
  tableProfile,
  detections,
  relationships = [],
  limits: limitOverrides = {},
}) {
  if (!tableProfile || !Array.isArray(detections)) {
    throw new TypeError('tableProfile and detections are required.');
  }
  const limits = Object.freeze({ ...DEFAULT_SCENARIO_LIMITS, ...limitOverrides });
  const scenarios = [];
  const matchers = [];
  const warnings = [];
  let limitReached = false;

  const addScenario = ({ columnIndex, kind, priority, description, sensitive = false, evidence = [], details = {}, match, ordinal = 0 }) => {
    if (scenarios.length >= limits.maxScenarios) {
      limitReached = true;
      return;
    }
    const id = columnIndex === null
      ? `relationship:${kind}:${ordinal}`
      : `column:${columnIndex}:${kind}:${ordinal}`;
    const columnNames = columnIndex === null ? details.columnNames ?? [] : [tableProfile.columns[columnIndex].columnName];
    const scenario = createCoverageScenario({
      id,
      kind,
      columnNames,
      priority,
      weight: priority,
      description,
      sensitive,
      evidence,
      details: Object.freeze({ ...details, columnIndex }),
    });
    scenarios.push(scenario);
    matchers.push(Object.freeze({ scenarioId: id, scenario, match }));
  };

  for (let columnIndex = 0; columnIndex < tableProfile.columns.length; columnIndex += 1) {
    const profile = tableProfile.columns[columnIndex];
    const detection = detections[columnIndex];
    const type = detection.type;

    if (profile.emptyCount > 0) {
      addScenario({
        columnIndex, kind: 'NULL_VALUE', priority: 95,
        description: 'Exercise an empty value in this column.',
        evidence: [`${profile.emptyCount} empty values were observed.`],
        match: (row) => row[columnIndex] === null || row[columnIndex] === undefined || String(row[columnIndex]).trim() === '',
      });
    }
    if (profile.nonEmptyCount > 0) {
      addScenario({
        columnIndex, kind: 'NON_EMPTY_VALUE', priority: 35,
        description: 'Exercise a non-empty value in this column.',
        evidence: [`${profile.nonEmptyCount} non-empty values were observed.`],
        match: (row) => row[columnIndex] !== null && row[columnIndex] !== undefined && String(row[columnIndex]).trim() !== '',
      });
    }

    if (type === 'BOOLEAN') {
      for (const [ordinal, booleanKind] of ['FALSE_LIKE', 'TRUE_LIKE'].entries()) {
        if ((profile.topValues ?? []).some((entry) => booleanClass(String(entry.value)) === booleanKind)) {
          addScenario({
            columnIndex, kind: `BOOLEAN_${booleanKind}`, priority: 90, ordinal,
            description: `Exercise the ${booleanKind.toLocaleLowerCase().replace('_', '-')} Boolean state.`,
            evidence: ['The state occurred in the bounded value distribution.'],
            match: (row) => booleanClass(String(row[columnIndex] ?? '')) === booleanKind,
          });
        }
      }
    }

    if (type === 'CATEGORY') {
      const ranked = [...(profile.topValues ?? [])].sort((left, right) => right.count - left.count);
      const rareThreshold = Math.max(2, Math.floor(profile.nonEmptyCount * 0.01));
      const rare = ranked
        .filter((entry) => entry.count <= rareThreshold)
        .sort((left, right) => left.count - right.count)
        .slice(0, limits.maxRareCategoriesPerColumn);
      const rareValues = new Set(rare.map((entry) => entry.value));
      const common = ranked
        .filter((entry) => !rareValues.has(entry.value))
        .slice(0, limits.maxCommonCategoriesPerColumn);
      common.forEach((entry, ordinal) => {
        const privateValue = String(entry.value);
        addScenario({
          columnIndex, kind: 'CATEGORY_COMMON', priority: 65, ordinal,
          description: `Exercise a major category at bounded rank ${ordinal + 1}.`,
          evidence: [`Bounded frequency count was ${entry.count} with status ${entry.status}.`],
          details: { categoryRank: ordinal + 1, observedCount: entry.count },
          match: (row) => String(row[columnIndex] ?? '').trim() === privateValue,
        });
      });
      rare.forEach((entry, ordinal) => {
          const privateValue = String(entry.value);
          addScenario({
            columnIndex, kind: 'CATEGORY_RARE_FEATURE', priority: 92, ordinal,
            description: `Exercise a low-frequency category feature at bounded rare rank ${ordinal + 1}; the original value must be generalised.`,
            sensitive: true,
            evidence: [`Bounded frequency count was ${entry.count} with status ${entry.status}.`],
            details: { rareRank: ordinal + 1, observedCount: entry.count, preserveOriginalValue: false },
            match: (row) => String(row[columnIndex] ?? '').trim() === privateValue,
          });
      });
    }

    if (profile.numericStats?.count > 0) {
      const numeric = profile.numericStats;
      const numericValue = (row) => parseNumericToken(String(row[columnIndex] ?? ''))?.value ?? null;
      for (const [kind, value, priority, ordinal] of [
        ['NUMERIC_MINIMUM', numeric.minimum, 88, 0],
        ['NUMERIC_MAXIMUM', numeric.maximum, 88, 1],
      ]) {
        addScenario({
          columnIndex, kind, priority, ordinal,
          description: `Exercise the observed numeric ${kind === 'NUMERIC_MINIMUM' ? 'minimum' : 'maximum'} boundary after policy transformation.`,
          sensitive: true,
          evidence: [`The boundary statistic was exact over ${numeric.count} numeric values.`],
          details: { preserveOriginalValue: false },
          match: (row) => numericValue(row) === value,
        });
      }
      const scale = Math.max(Math.abs(numeric.maximum - numeric.minimum), 1);
      addScenario({
        columnIndex, kind: 'NUMERIC_COMMON_RANGE', priority: 50,
        description: 'Exercise a value near the central numeric range.',
        evidence: [`The bounded median status was ${numeric.medianStatus}.`],
        match: (row) => {
          const value = numericValue(row);
          return value !== null && Math.abs(value - numeric.average) <= scale * 0.25;
        },
      });
    }

    if (['DATE', 'DATETIME', 'TIME'].includes(type)) {
      const temporalSamples = (profile.sampleValues ?? [])
        .map((value) => ({ value: String(value), key: temporalOrderKey(String(value)) }))
        .filter((entry) => entry.key !== null && parseTemporalValue(entry.value));
      if (temporalSamples.length > 0) {
        temporalSamples.sort((left, right) => left.key - right.key);
        for (const [kind, entry, ordinal] of [
          ['TEMPORAL_EARLIEST', temporalSamples[0], 82, 0],
          ['TEMPORAL_LATEST', temporalSamples.at(-1), 82, 1],
        ]) {
          const privateValue = entry.value;
          addScenario({
            columnIndex, kind, priority: 82, ordinal,
            description: `Exercise the ${kind === 'TEMPORAL_EARLIEST' ? 'earliest' : 'latest'} sampled temporal boundary after shifting.`,
            sensitive: true,
            evidence: [`Boundary derived from ${temporalSamples.length} bounded temporal samples.`],
            details: { preserveOriginalValue: false },
            match: (row) => String(row[columnIndex] ?? '').trim() === privateValue,
          });
        }
      }
    }

    const pattern = detection.details?.pattern;
    for (const [ordinal, shape] of (pattern?.commonShapes ?? []).slice(0, limits.maxPatternsPerColumn).entries()) {
      addScenario({
        columnIndex, kind: 'VALUE_PATTERN', priority: ordinal === 0 ? 55 : 72, ordinal,
        description: `Exercise bounded positional pattern rank ${ordinal + 1}.`,
        evidence: [`Pattern coverage was ${(shape.coverage * 100).toFixed(1)}% in ${pattern.sampleSize} analysed samples.`],
        details: { patternShape: shape.value, patternRank: ordinal + 1 },
        match: (row) => valueShape(String(row[columnIndex] ?? '').trim()) === shape.value,
      });
    }

    const minimumLength = profile.lengthStats?.minimum;
    const maximumLength = profile.lengthStats?.maximum;
    if (minimumLength !== null && minimumLength !== undefined && maximumLength !== null && maximumLength !== undefined && minimumLength !== maximumLength) {
      for (const [kind, length, ordinal] of [
        ['MINIMUM_LENGTH', minimumLength, 60, 0],
        ['MAXIMUM_LENGTH', maximumLength, 70, 1],
      ]) {
        addScenario({
          columnIndex, kind, priority: kind === 'MAXIMUM_LENGTH' ? 70 : 60, ordinal,
          description: `Exercise the observed ${kind === 'MINIMUM_LENGTH' ? 'minimum' : 'maximum'} non-empty length.`,
          evidence: [`Exact observed length boundary was ${length}.`],
          match: (row) => String(row[columnIndex] ?? '').trim().length === length,
        });
      }
    }
  }

  const nameToIndex = new Map(tableProfile.columns.map((profile, index) => [profile.columnName, index]));
  relationships.filter(relationshipIsActive).forEach((rule, ordinal) => {
    const indexes = rule.columnNames.map((name) => nameToIndex.get(name));
    if (indexes.some((index) => index === undefined)) return;
    addScenario({
      columnIndex: null,
      kind: `RELATIONSHIP_${rule.kind}`,
      priority: 98,
      ordinal,
      description: `Exercise confirmed relationship ${rule.kind} across ${rule.columnNames.length} columns.`,
      sensitive: true,
      evidence: [...(rule.evidence ?? []), `Relationship confidence was ${rule.confidence}.`],
      details: { relationshipId: rule.id, columnNames: rule.columnNames, preserveOriginalValue: false },
      match: (row) => {
        if (rule.kind === 'SAME_VALUE') return indexes.every((index) => row[index] === row[indexes[0]]);
        return indexes.every((index) => row[index] !== null && row[index] !== undefined && String(row[index]).trim() !== '');
      },
    });
  });

  if (limitReached) {
    warnings.push(createContractWarning(
      'SCENARIO_LIMIT_REACHED',
      'Coverage scenarios reached the configured bound; later scenarios were omitted.',
      { maxScenarios: limits.maxScenarios },
    ));
  }
  return Object.freeze({
    scenarios: Object.freeze(scenarios),
    matchers: Object.freeze(matchers),
    warnings: Object.freeze(warnings),
    limits,
  });
}
