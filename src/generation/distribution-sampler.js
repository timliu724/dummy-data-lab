import { parseNumericToken } from '../profile/value-normalization.js';
import { stableHash32 } from '../profile/value-normalization.js';

const NUMERIC_DISTRIBUTION_TYPES = new Set(['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE']);
const MIXED_NUMERIC_TYPES = new Set(['CATEGORY', 'GENERAL_TEXT']);
const MIXED_NUMERIC_MINIMUM_RATIO = 0.80;

function isLowCardinalityTextVocabulary(profile, detectedType) {
  return MIXED_NUMERIC_TYPES.has(detectedType)
    && profile.uniqueCountStatus === 'EXACT'
    && (profile.uniqueCount ?? Number.POSITIVE_INFINITY) <= 64
    && (profile.uniqueRatio ?? 1) <= 0.1;
}

function boundedVocabularyTopValues(profile, detectedType) {
  const entries = profile.topValues ?? [];
  if (!isLowCardinalityTextVocabulary(profile, detectedType)) return entries;
  const dominantLength = (profile.lengthStats?.common ?? [])[0];
  if ((dominantLength?.ratio ?? 0) < 0.99) return entries;
  const expectedLength = Number(dominantLength.value);
  const matching = entries.filter((entry) => String(entry.value ?? '').length === expectedLength);
  return matching.length > 0 ? matching : entries;
}

function weightedPick(entries, random) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.count ?? 0), 0);
  if (total <= 0) return random.pick(entries).value;
  let point = random.nextFloat() * total;
  for (const entry of entries) {
    point -= Math.max(0, entry.count ?? 0);
    if (point <= 0) return entry.value;
  }
  return entries.at(-1).value;
}

function decimalPlacesNeeded(number) {
  if (!Number.isFinite(number) || Number.isInteger(number)) return 0;
  const fixed = number.toFixed(12).replace(/0+$/, '');
  return Math.max(0, fixed.length - fixed.indexOf('.') - 1);
}

function formatNumeric(number, sample, type, decimalPlacesOverride = null, bounds = null) {
  const parsed = parseNumericToken(String(sample ?? ''));
  const decimalPlaces = type === 'INTEGER'
    ? 0
    : Number.isInteger(decimalPlacesOverride)
      ? decimalPlacesOverride
      : parsed?.decimalPlaces ?? 2;
  const step = 10 ** -decimalPlaces;
  let rounded = Math.round(number / step) * step;
  if (Number.isFinite(bounds?.minimum) && Number.isFinite(bounds?.maximum)) {
    const stepTolerance = step * 1e-9;
    const minimumRepresentable = Math.ceil((bounds.minimum - stepTolerance) / step) * step;
    const maximumRepresentable = Math.floor((bounds.maximum + stepTolerance) / step) * step;
    if (minimumRepresentable <= maximumRepresentable) {
      rounded = Math.min(maximumRepresentable, Math.max(minimumRepresentable, rounded));
    }
  }
  let core = decimalPlaces === 0 ? String(Math.round(rounded)) : rounded.toFixed(decimalPlaces);
  if (type === 'INTEGER' && parsed?.hasLeadingZero) {
    const sign = core.startsWith('-') || core.startsWith('+') ? core[0] : '';
    const unsigned = sign ? core.slice(1) : core;
    core = `${sign}${unsigned.padStart(parsed.digitCount, '0')}`;
  }
  if (type === 'PERCENTAGE') return `${core}%`;
  if (type === 'CURRENCY_LIKE') {
    const marker = parsed?.currencyMarker ?? '$';
    const source = String(sample ?? '').trim();
    return source.endsWith(marker) ? `${core} ${marker}` : `${marker}${core}`;
  }
  return core;
}

function numericFormatSample(profile) {
  return (profile.sampleValues ?? []).find((value) => parseNumericToken(String(value)) !== null) ?? '';
}

function numericDecimalPlaces(profile, random) {
  const entries = profile.decimalPlaces ?? [];
  if (entries.length === 0) return null;
  const selected = weightedPick(entries, random);
  return Number.isInteger(Number(selected)) ? Number(selected) : null;
}

function completeLowCardinalitySupport(profile) {
  const topValues = profile.topValues ?? [];
  return profile.uniqueCountStatus === 'EXACT'
    && Number.isInteger(profile.uniqueCount)
    && profile.uniqueCount <= topValues.length
    && profile.measurementStatus?.topValues === 'EXACT';
}

function entriesFromValues(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value - right.value);
}

function numericDistributionEligible(profile, detectedType) {
  if (NUMERIC_DISTRIBUTION_TYPES.has(detectedType)) return true;
  if (!MIXED_NUMERIC_TYPES.has(detectedType)) return false;
  const nonEmptyCount = profile.nonEmptyCount ?? 0;
  if (isLowCardinalityTextVocabulary(profile, detectedType)) return false;
  return nonEmptyCount > 0
    && (profile.numericStats?.count ?? 0) / nonEmptyCount >= MIXED_NUMERIC_MINIMUM_RATIO;
}

function numericDistribution(profile, detectedType) {
  if (!numericDistributionEligible(profile, detectedType)) return null;
  if (completeLowCardinalitySupport(profile)) return null;
  const numeric = profile.numericStats;
  if (numeric?.distributionSupportStatus === 'EXACT'
    && Array.isArray(numeric.distributionSupport)
    && numeric.distributionSupport.length > 0) {
    return Object.freeze({
      entries: numeric.distributionSupport,
      totalCount: numeric.count,
      exact: true,
    });
  }
  const values = numeric?.distributionSample;
  return Array.isArray(values) && values.length > 0
    ? Object.freeze({ entries: entriesFromValues(values), totalCount: values.length, exact: false })
    : null;
}

function valueAtRank(entries, rank) {
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.count;
    if (rank < cumulative) return entry.value;
  }
  return entries.at(-1).value;
}

function empiricalValue(distribution, probability, interpolate) {
  const bounded = Math.min(1, Math.max(0, probability));
  if (!interpolate) {
    const rank = Math.min(distribution.totalCount - 1, Math.floor(bounded * distribution.totalCount));
    return valueAtRank(distribution.entries, rank);
  }
  const position = bounded * (distribution.totalCount - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = valueAtRank(distribution.entries, lowerIndex);
  const upper = valueAtRank(distribution.entries, upperIndex);
  return lowerIndex === upperIndex ? lower : lower + (upper - lower) * (position - lowerIndex);
}

function shouldInterpolate(profile, detectedType) {
  if (detectedType !== 'INTEGER') return true;
  return (profile.uniqueRatio ?? 0) >= 0.20;
}

function sampleNumeric({ profile, detectedType, random, probability = random.nextFloat(), forcedValue = null }) {
  if (!numericDistributionEligible(profile, detectedType)) return null;
  const distribution = numericDistribution(profile, detectedType);
  const numeric = profile.numericStats;
  let sampled;
  if (Number.isFinite(forcedValue)) sampled = forcedValue;
  else if (distribution) sampled = empiricalValue(
    distribution,
    probability,
    shouldInterpolate(profile, detectedType),
  );
  else if (numeric?.count > 0 && Number.isFinite(numeric.minimum) && Number.isFinite(numeric.maximum)) {
    sampled = numeric.minimum + probability * (numeric.maximum - numeric.minimum);
  } else return null;
  const selectedDecimalPlaces = numericDecimalPlaces(profile, random);
  const decimalPlaces = Number.isFinite(forcedValue) && detectedType !== 'INTEGER'
    ? Math.max(selectedDecimalPlaces ?? 0, decimalPlacesNeeded(forcedValue))
    : selectedDecimalPlaces;
  return formatNumeric(
    sampled,
    numericFormatSample(profile),
    detectedType,
    decimalPlaces,
    numeric,
  );
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function coprimeStride(length, seed) {
  if (length <= 1) return 1;
  let candidate = 1 + (seed % (length - 1));
  while (greatestCommonDivisor(candidate, length) !== 1) {
    candidate += 1;
    if (candidate >= length) candidate = 1;
  }
  return candidate;
}

export class DistributionSamplerContext {
  constructor({ random, outputRowCount, businessFidelity = 'BALANCED' } = {}) {
    if (!random) throw new TypeError('random is required.');
    if (!Number.isInteger(outputRowCount) || outputRowCount <= 0) throw new RangeError('outputRowCount must be a positive integer.');
    this.random = random;
    this.outputRowCount = outputRowCount;
    this.businessFidelity = businessFidelity;
    this.columnStates = new Map();
    this.sampleCount = 0;
    this.stratifiedSampleCount = 0;
    this.extremeSampleCount = 0;
  }

  sample({ profile = {}, detectedType = 'UNKNOWN', columnIndex = 0 } = {}) {
    const distribution = numericDistribution(profile, detectedType);
    if (!distribution) return sampleDistribution({ profile, detectedType, random: this.random });
    const numericRatio = profile.observedRowCount > 0 && profile.numericStats?.count > 0
      ? profile.numericStats.count / profile.observedRowCount
      : null;
    const samplingRatio = Number.isFinite(numericRatio)
      ? numericRatio
      : Number.isFinite(profile.nonEmptyRatio) ? profile.nonEmptyRatio : 1;
    const expectedNonEmptyCount = Math.max(1, Math.min(
      this.outputRowCount,
      Math.round(this.outputRowCount * samplingRatio),
    ));
    let state = this.columnStates.get(columnIndex);
    if (!state) {
      const seed = stableHash32(`${columnIndex}|${profile.columnName ?? ''}|${this.outputRowCount}`);
      state = {
        ordinal: 0,
        expectedNonEmptyCount,
        offset: seed % expectedNonEmptyCount,
        stride: coprimeStride(expectedNonEmptyCount, seed >>> 8),
      };
      this.columnStates.set(columnIndex, state);
    }
    const ordinal = state.ordinal;
    state.ordinal += 1;
    this.sampleCount += 1;
    const preserveHighExtremes = this.businessFidelity === 'HIGH'
      && this.outputRowCount === profile.observedRowCount
      && expectedNonEmptyCount >= 100;
    if (preserveHighExtremes && ordinal < 2) {
      this.extremeSampleCount += 1;
      return sampleNumeric({
        profile,
        detectedType,
        random: this.random,
        forcedValue: ordinal === 0 ? profile.numericStats.minimum : profile.numericStats.maximum,
      });
    }
    const reservedExtremes = preserveHighExtremes ? 2 : 0;
    const strata = Math.max(1, state.expectedNonEmptyCount - reservedExtremes);
    const position = Math.max(0, ordinal - reservedExtremes) % strata;
    const stratum = (position * state.stride + state.offset) % strata;
    let probability = (stratum + this.random.nextFloat()) / strata;
    if (preserveHighExtremes && profile.numericStats.count > 2) {
      const count = profile.numericStats.count;
      probability = shouldInterpolate(profile, detectedType)
        ? (1 + probability * (count - 3)) / (count - 1)
        : (1 + probability * (count - 2)) / count;
    }
    this.stratifiedSampleCount += 1;
    return sampleNumeric({ profile, detectedType, random: this.random, probability });
  }

  statistics() {
    return Object.freeze({
      sampledColumnCount: this.columnStates.size,
      sampleCount: this.sampleCount,
      stratifiedSampleCount: this.stratifiedSampleCount,
      extremeSampleCount: this.extremeSampleCount,
    });
  }
}

export function sampleDistribution({ profile = {}, detectedType = 'UNKNOWN', random }) {
  if (!random) throw new TypeError('random is required.');
  const sampledNumeric = sampleNumeric({ profile, detectedType, random });
  if (sampledNumeric !== null) return sampledNumeric;
  const topValues = boundedVocabularyTopValues(profile, detectedType);
  if (topValues.length > 0) return weightedPick(topValues, random);
  const numeric = profile.numericStats;
  if (numeric?.count > 0 && Number.isFinite(numeric.minimum) && Number.isFinite(numeric.maximum)) {
    const sampled = numeric.minimum + random.nextFloat() * (numeric.maximum - numeric.minimum);
    return formatNumeric(sampled, profile.sampleValues?.[0], detectedType);
  }
  if (detectedType === 'BOOLEAN') return random.pick(['true', 'false']);
  const samples = profile.sampleValues ?? [];
  return samples.length > 0 ? random.pick(samples) : '';
}
