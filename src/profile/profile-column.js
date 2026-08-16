import { createColumnProfile, createContractWarning } from '../core/contracts.js';
import { BoundedCounter } from './bounded-counter.js';
import {
  BoundedStratifiedSample,
  RunningNumericStatistics,
  safeRatio,
} from './statistics.js';
import {
  normalizeValue,
  stableFingerprint,
  truncateForTracking,
} from './value-normalization.js';

export const DEFAULT_PROFILE_LIMITS = Object.freeze({
  topValues: 20,
  sampleValues: 64,
  uniqueValues: 4096,
  numericSamples: 1024,
  commonLengths: 24,
  decimalPlaces: 12,
  maxTrackedValueLength: 256,
  maxSampleValueLength: 512,
  maxColumnNameLength: 128,
  maxColumns: 1000,
});

/** @param {Partial<typeof DEFAULT_PROFILE_LIMITS>} [overrides] */
export function resolveProfileLimits(overrides = {}) {
  const resolved = { ...DEFAULT_PROFILE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(resolved)) {
    const minimum = name.includes('Length') ? 24 : 1;
    if (!Number.isInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be an integer of at least ${minimum}.`);
    }
  }
  return Object.freeze(resolved);
}

/**
 * Incremental, fixed-capacity profiler for one column.
 *
 * @param {Object} values
 * @param {number} values.columnIndex
 * @param {string} values.columnName
 * @param {Partial<typeof DEFAULT_PROFILE_LIMITS>} [values.limits]
 * @param {number} [values.initialEmptyCount]
 */
export function createColumnProfiler({
  columnIndex,
  columnName,
  limits: limitOverrides,
  initialEmptyCount = 0,
}) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) {
    throw new RangeError('columnIndex must be a non-negative integer.');
  }
  if (!Number.isInteger(initialEmptyCount) || initialEmptyCount < 0) {
    throw new RangeError('initialEmptyCount must be a non-negative integer.');
  }
  const limits = resolveProfileLimits(limitOverrides);
  const safeColumnName = truncateForTracking(
    String(columnName || `column_${columnIndex + 1}`),
    limits.maxColumnNameLength,
  ).value;

  const uniqueValues = new Set();
  const topValues = new BoundedCounter(limits.topValues);
  const lengthCounts = new BoundedCounter(limits.commonLengths);
  const decimalPlaceCounts = new BoundedCounter(limits.decimalPlaces);
  const samples = new BoundedStratifiedSample(limits.sampleValues);
  const numeric = new RunningNumericStatistics(limits.numericSamples, limits.uniqueValues);
  const caseCounts = new Map([
    ['UPPER', 0],
    ['LOWER', 0],
    ['TITLE', 0],
    ['MIXED', 0],
    ['NO_CASE', 0],
  ]);

  let observedRowCount = initialEmptyCount;
  let emptyCount = initialEmptyCount;
  let nonEmptyCount = 0;
  let minimumLength = null;
  let maximumLength = null;
  let uniqueOverflow = false;
  let fingerprintedUniqueValues = false;
  let truncatedValueCount = 0;

  /** @param {unknown} value */
  const update = (value) => {
    observedRowCount += 1;
    const normalized = normalizeValue(value);
    if (normalized.isEmpty) {
      emptyCount += 1;
      return;
    }

    nonEmptyCount += 1;
    minimumLength = minimumLength === null ? normalized.length : Math.min(minimumLength, normalized.length);
    maximumLength = maximumLength === null ? normalized.length : Math.max(maximumLength, normalized.length);
    lengthCounts.increment(normalized.length);
    caseCounts.set(normalized.casePattern, (caseCounts.get(normalized.casePattern) ?? 0) + 1);

    const tracked = truncateForTracking(normalized.text, limits.maxTrackedValueLength);
    const sample = truncateForTracking(normalized.text, limits.maxSampleValueLength);
    if (tracked.truncated || sample.truncated) truncatedValueCount += 1;
    const fingerprint = tracked.fingerprint ?? stableFingerprint(normalized.text);
    const uniqueKey = tracked.truncated ? `#${fingerprint}` : normalized.text;
    if (tracked.truncated) fingerprintedUniqueValues = true;

    if (!uniqueValues.has(uniqueKey)) {
      if (uniqueValues.size < limits.uniqueValues) uniqueValues.add(uniqueKey);
      else uniqueOverflow = true;
    }
    topValues.increment(tracked.value);
    samples.offer(sample.value, fingerprint);

    if (normalized.numeric) {
      numeric.update(normalized.numeric.value);
      decimalPlaceCounts.increment(normalized.numeric.decimalPlaces);
    }
  };

  const finalize = () => {
    let uniqueCountStatus = 'EXACT';
    let uniqueCount = uniqueValues.size;
    if (uniqueOverflow) {
      uniqueCountStatus = fingerprintedUniqueValues ? 'ESTIMATED' : 'LOWER_BOUND';
      uniqueCount = uniqueValues.size + 1;
    } else if (fingerprintedUniqueValues) {
      uniqueCountStatus = 'ESTIMATED';
    }

    const sampleValues = samples.snapshot();
    const numericStats = numeric.count > 0 ? numeric.snapshot() : null;
    const warnings = [];
    if (uniqueOverflow) {
      warnings.push(createContractWarning(
        'UNIQUE_TRACKING_LIMIT_REACHED',
        'Unique values exceeded the bounded tracking limit; the reported count is not exact.',
        { limit: limits.uniqueValues, status: uniqueCountStatus },
      ));
    }
    if (truncatedValueCount > 0) {
      warnings.push(createContractWarning(
        'PROFILE_VALUE_TRUNCATED',
        'One or more long values were fingerprinted or truncated for bounded-memory profiling.',
        { truncatedValueCount, maxTrackedValueLength: limits.maxTrackedValueLength },
      ));
    }

    const casePatterns = Object.freeze(Object.fromEntries(
      [...caseCounts.entries()].map(([name, count]) => [name, Object.freeze({
        count,
        ratio: safeRatio(count, nonEmptyCount),
      })]),
    ));
    const commonLengths = lengthCounts.snapshot(Math.min(10, limits.commonLengths));
    const trackedTopValues = topValues.snapshot(limits.topValues);
    const decimalPlaces = decimalPlaceCounts.snapshot(limits.decimalPlaces);
    const sampleStatus = nonEmptyCount === sampleValues.length ? 'EXACT' : 'SAMPLED';
    const measurementStatus = Object.freeze({
      counts: 'EXACT',
      ratios: 'EXACT',
      uniqueCount: uniqueCountStatus,
      lengthRange: 'EXACT',
      commonLengths: lengthCounts.status,
      topValues: topValues.status,
      numericMinMax: numericStats ? 'EXACT' : 'NOT_COMPUTED',
      numericAverage: numericStats ? 'EXACT' : 'NOT_COMPUTED',
      numericMedian: numericStats?.medianStatus ?? 'NOT_COMPUTED',
      numericDistribution: numericStats?.distributionSampleStatus ?? 'NOT_COMPUTED',
      numericSupport: numericStats?.distributionSupportStatus ?? 'NOT_COMPUTED',
      numericQuantiles: numericStats?.quantileStatus ?? 'NOT_COMPUTED',
      decimalPlaces: numericStats ? decimalPlaceCounts.status : 'NOT_COMPUTED',
      sampleValues: sampleStatus,
    });

    return createColumnProfile({
      columnIndex,
      columnName: safeColumnName,
      observedRowCount,
      nonEmptyCount,
      nullCount: emptyCount,
      emptyCount,
      nonEmptyRatio: safeRatio(nonEmptyCount, observedRowCount),
      emptyRatio: safeRatio(emptyCount, observedRowCount),
      uniqueCount,
      uniqueRatio: safeRatio(uniqueCount, nonEmptyCount),
      uniqueCountStatus,
      sampleValues,
      lengthStats: Object.freeze({
        minimum: minimumLength,
        maximum: maximumLength,
        common: commonLengths,
      }),
      topValues: trackedTopValues,
      numericStats,
      decimalPlaces,
      casePatterns,
      measurementStatus,
      warnings,
      limits,
      measurements: Object.freeze({
        sampleSize: sampleValues.length,
        sampledFromNonEmptyCount: nonEmptyCount,
        trackedUniqueEntries: uniqueValues.size,
        trackedTopValueEntries: topValues.memoryEntryCount(),
        numericMedianSampleSize: numericStats?.medianSampleSize ?? 0,
        numericDistributionSampleSize: numericStats?.distributionSampleSize ?? 0,
        numericDistributionSupportSize: numericStats?.distributionSupportSize ?? 0,
        truncatedValueCount,
      }),
    });
  };

  const memorySummary = () => Object.freeze({
    trackedUniqueEntries: uniqueValues.size,
    trackedTopValueEntries: topValues.memoryEntryCount(),
    sampleEntries: samples.size,
    numericSampleEntries: numeric.sample.values.length,
    numericSupportEntries: numeric.supportCounts.size,
    lengthEntries: lengthCounts.memoryEntryCount(),
    decimalPlaceEntries: decimalPlaceCounts.memoryEntryCount(),
  });

  return Object.freeze({
    update,
    finalize,
    memorySummary,
    limits,
    columnIndex,
    columnName: safeColumnName,
  });
}
