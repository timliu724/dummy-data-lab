/** @param {string} character */
export function characterClass(character) {
  if (/\p{Lu}/u.test(character)) return 'A';
  if (/\p{Ll}/u.test(character)) return 'a';
  if (/\p{L}/u.test(character)) return 'L';
  if (/\p{N}/u.test(character)) return '9';
  if (/\s/u.test(character)) return '␠';
  return character;
}

/** @param {string} value */
export function valueShape(value) {
  return [...value].map(characterClass).join('');
}

/** @param {readonly string[]} values @param {'prefix'|'suffix'} direction @param {number} maxLength */
function commonAffix(values, direction, maxLength) {
  const counts = new Map();
  for (const value of values) {
    const upperLimit = Math.min(maxLength, Math.max(0, value.length - 1));
    for (let length = 2; length <= upperLimit; length += 1) {
      const affix = direction === 'prefix' ? value.slice(0, length) : value.slice(-length);
      counts.set(affix, (counts.get(affix) ?? 0) + 1);
    }
  }
  const minimumCoverageCount = Math.max(2, Math.ceil(values.length * 0.6));
  const candidates = [...counts.entries()]
    .filter(([, count]) => count >= minimumCoverageCount)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length);
  if (candidates.length === 0) return Object.freeze({ value: null, coverage: 0, matchedCount: 0 });
  return Object.freeze({
    value: candidates[0][0],
    coverage: candidates[0][1] / values.length,
    matchedCount: candidates[0][1],
  });
}

/** @param {Map<unknown, number>} counts @param {number} total @param {number} [limit] */
function rankedCounts(counts, total, limit = 10) {
  return Object.freeze(
    [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
      .slice(0, limit)
      .map(([value, count]) => Object.freeze({ value, count, coverage: total === 0 ? 0 : count / total })),
  );
}

function structuralGroup(value, direction) {
  const text = String(value ?? '');
  if (direction === 'prefix') {
    const letters = text.match(/^([A-Za-z]{2,8})(?=[0-9._/-]|$)/)?.[1];
    if (letters) return letters;
    const mixedDigits = text.match(/^(\d{2,4})(?=[A-Za-z._/-])/)?.[1];
    if (mixedDigits) return mixedDigits;
    if (/^\d{4,}$/.test(text)) return text.slice(0, 2);
    return null;
  }
  const letters = text.match(/([A-Za-z]{2,8})$/)?.[1];
  if (letters && (text.length === letters.length || /[0-9._/-]/.test(text.at(-(letters.length + 1))))) return letters;
  const mixedDigits = text.match(/(\d{2,4})$/)?.[1];
  if (mixedDigits && text.length > mixedDigits.length && /[A-Za-z._/-]/.test(text.at(-(mixedDigits.length + 1)))) return mixedDigits;
  return null;
}

function structuralGroups(values, direction) {
  const counts = new Map();
  for (const value of values) {
    const group = structuralGroup(value, direction);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return Object.freeze(rankedCounts(counts, values.length, 8).filter((entry) => (
    /[A-Za-z]/.test(String(entry.value)) || entry.count >= 2
  )));
}

/**
 * Uses the profiler's early/hash sample plus bounded top values. No new raw
 * values are retained outside this returned bounded summary.
 *
 * @param {import('../core/contracts.js').ColumnProfile} profile
 * @param {Object} [options]
 * @param {number} [options.maxSamples]
 * @param {number} [options.maxAffixLength]
 */
export function analyseValuePatterns(profile, { maxSamples = 128, maxAffixLength = 12 } = {}) {
  const combined = [
    ...(profile.sampleValues ?? []),
    ...(profile.topValues ?? []).map((entry) => entry.value),
  ].map(String).filter((value) => value.length > 0);
  const values = [...new Set(combined)].slice(0, maxSamples);
  const lengthCounts = new Map();
  const shapeCounts = new Map();
  const caseCounts = new Map();
  for (const value of values) {
    lengthCounts.set(value.length, (lengthCounts.get(value.length) ?? 0) + 1);
    const shape = valueShape(value);
    shapeCounts.set(shape, (shapeCounts.get(shape) ?? 0) + 1);
    const caseName = value === value.toLocaleUpperCase() && value !== value.toLocaleLowerCase()
      ? 'UPPER'
      : value === value.toLocaleLowerCase() && value !== value.toLocaleUpperCase()
        ? 'LOWER'
        : /\p{L}/u.test(value)
          ? 'MIXED'
          : 'NO_CASE';
    caseCounts.set(caseName, (caseCounts.get(caseName) ?? 0) + 1);
  }

  const lengths = [...lengthCounts.keys()];
  const fixedLength = lengths.length === 1 ? lengths[0] : null;
  const variablePositions = [];
  if (fixedLength !== null && values.length > 1) {
    for (let index = 0; index < fixedLength; index += 1) {
      const characters = new Set(values.map((value) => value[index]));
      if (characters.size > 1) variablePositions.push(index);
    }
  }
  const commonShapes = rankedCounts(shapeCounts, values.length);
  const multiValue = analyseMultiValuePattern(values, { maxSamples });

  return Object.freeze({
    sampleSize: values.length,
    sampledFromNonEmptyCount: profile.nonEmptyCount ?? 0,
    sampleStrategy: 'PROFILE_STRATIFIED_PLUS_TOP_VALUES',
    status: values.length >= (profile.nonEmptyCount ?? 0) ? 'EXACT' : 'SAMPLED',
    fixedLength,
    commonLengths: rankedCounts(lengthCounts, values.length),
    commonPrefix: commonAffix(values, 'prefix', maxAffixLength),
    commonSuffix: commonAffix(values, 'suffix', maxAffixLength),
    prefixGroups: structuralGroups(values, 'prefix'),
    suffixGroups: structuralGroups(values, 'suffix'),
    commonShapes,
    dominantShape: commonShapes[0] ?? null,
    casePatterns: rankedCounts(caseCounts, values.length),
    variablePositions: Object.freeze(variablePositions),
    multiValue,
    uniqueness: Object.freeze({
      count: profile.uniqueCount,
      ratio: profile.uniqueRatio,
      status: profile.uniqueCountStatus,
    }),
  });
}
import { analyseMultiValuePattern } from './multi-value-pattern.js';
