import { createTableProfiler } from '../profile/profile-table.js';

const MAX_OUTPUT_PROFILE_ROWS = 10_000;
const NULL_RATE_TOLERANCE = 0.05;
const CATEGORY_DISTANCE_TOLERANCE = 0.15;
const NUMERIC_MEDIAN_RANGE_TOLERANCE = 0.20;
const NUMERIC_SUPPORT_MINIMUM_FRACTION = 0.70;
const NUMERIC_MEAN_SPREAD_TOLERANCE = 0.08;
const NUMERIC_QUANTILE_SPREAD_TOLERANCE = 0.10;
const NUMERIC_TAIL_SPREAD_TOLERANCE = 0.12;
const MIN_EXPECTED_TAIL_ROWS = 5;

function percentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentagePoints(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)} pp`;
}

function numberValue(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return Number(value.toPrecision(8)).toLocaleString('en-AU');
}

function outputRowsForProfile(rows, maximumRows) {
  if (rows.length <= maximumRows) return rows;
  return Array.from({ length: maximumRows }, (_, index) => rows[Math.floor(index * rows.length / maximumRows)]);
}

function profileOutput(generationResult, maximumRows) {
  const selectedRows = outputRowsForProfile(generationResult.rows, maximumRows);
  const profiler = createTableProfiler({ headers: generationResult.headers });
  selectedRows.forEach((row) => profiler.updateRow(row));
  return Object.freeze({
    tableProfile: profiler.finalize(),
    profiledRowCount: selectedRows.length,
    totalRowCount: generationResult.rows.length,
    measurement: selectedRows.length === generationResult.rows.length ? 'EXACT' : 'SAMPLED',
  });
}

function distributionExpectation(action) {
  if (action === 'DROP' || action === 'CLEAR') return 'EXPECTED_CHANGE';
  if (action === 'KEEP' || action === 'RESAMPLE') return 'PRESERVE';
  if (action === 'SHIFT') return 'SHIFTED';
  return 'STRUCTURE_ONLY';
}

function categoryDistance(sourceProfile, outputProfile) {
  if (!sourceProfile.nonEmptyCount || !outputProfile.nonEmptyCount) return null;
  const source = new Map(sourceProfile.topValues.map((item) => [String(item.value), item.count / sourceProfile.nonEmptyCount]));
  const output = new Map(outputProfile.topValues.map((item) => [String(item.value), item.count / outputProfile.nonEmptyCount]));
  const values = new Set([...source.keys(), ...output.keys()]);
  let absoluteDifference = 0;
  for (const value of values) absoluteDifference += Math.abs((source.get(value) ?? 0) - (output.get(value) ?? 0));
  const sourceMass = [...source.values()].reduce((total, ratio) => total + ratio, 0);
  const outputMass = [...output.values()].reduce((total, ratio) => total + ratio, 0);
  absoluteDifference += Math.abs(Math.max(0, 1 - sourceMass) - Math.max(0, 1 - outputMass));
  return Object.freeze({
    value: Math.min(1, absoluteDifference / 2),
    measurement: sourceProfile.measurementStatus.topValues === 'EXACT'
      && outputProfile.measurementStatus.topValues === 'EXACT'
      ? 'EXACT'
      : 'BOUNDED_ESTIMATE',
  });
}

function approximateEqual(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-9;
}

function adaptiveSpreadTolerance(base, sourceCount, outputCount) {
  const measuredCount = Math.max(1, Math.min(sourceCount ?? 1, outputCount ?? 1));
  return Math.max(base, 3 / Math.sqrt(measuredCount));
}

function expectedDistinctSupport(sourceProfile, outputCount) {
  const support = sourceProfile.numericStats?.distributionSupport;
  const frequencyCounts = sourceProfile.numericStats?.distributionFrequencyCounts;
  if (sourceProfile.numericStats?.distributionSupportStatus === 'EXACT'
    && ((Array.isArray(support) && support.length > 0)
      || (Array.isArray(frequencyCounts) && frequencyCounts.length > 0))) {
    const counts = Array.isArray(frequencyCounts) && frequencyCounts.length > 0
      ? frequencyCounts
      : support.map((entry) => entry.count);
    const totalCount = counts.reduce((total, count) => total + count, 0);
    if (totalCount > 0) {
      return counts.reduce((expected, count) => {
        const probability = count / totalCount;
        const missingProbability = probability >= 1
          ? 0
          : Math.exp(outputCount * Math.log1p(-probability));
        return expected + 1 - missingProbability;
      }, 0);
    }
  }
  const sampledSupport = Math.max(1, Math.min(
    sourceProfile.numericStats?.distributionDistinctCount ?? sourceProfile.uniqueCount ?? 1,
    sourceProfile.uniqueCount ?? Number.POSITIVE_INFINITY,
  ));
  const sourceUniqueRatio = Number.isFinite(sourceProfile.uniqueRatio) ? sourceProfile.uniqueRatio : 0;
  return Math.max(1, Math.min(
    sampledSupport,
    outputCount,
    Math.max(1, Math.round(outputCount * sourceUniqueRatio)),
  ));
}

function fallbackQuantiles(stats) {
  return Object.freeze({
    p01: stats.minimum,
    p05: stats.minimum,
    p25: stats.median,
    p50: stats.median,
    p75: stats.median,
    p95: stats.maximum,
    p99: stats.maximum,
  });
}

function numericComparisonMetrics({
  sourceProfile,
  outputProfile,
  outputMeasurement,
  businessFidelity,
}) {
  const source = sourceProfile.numericStats;
  const output = outputProfile.numericStats;
  const sourceQuantiles = source.quantiles ?? fallbackQuantiles(source);
  const outputQuantiles = output.quantiles ?? fallbackQuantiles(output);
  const sourceRange = source.maximum - source.minimum;
  const robustSpread = Math.max(
    Math.abs((sourceQuantiles.p95 ?? source.maximum) - (sourceQuantiles.p05 ?? source.minimum)),
    Math.abs(sourceRange) * 0.10,
    Math.abs(source.average ?? 0) * 0.01,
    Number.EPSILON,
  );

  const expectedSupport = expectedDistinctSupport(sourceProfile, outputProfile.nonEmptyCount);
  const minimumExpectedSupport = Math.max(1, Math.ceil(expectedSupport * NUMERIC_SUPPORT_MINIMUM_FRACTION));
  const outputSupport = outputProfile.uniqueCount ?? output.distributionDistinctCount ?? 0;
  const uniqueSupportPass = outputSupport >= minimumExpectedSupport;

  const sourceNumericRate = source.count / Math.max(1, sourceProfile.observedRowCount);
  const outputNumericRate = output.count / Math.max(1, outputProfile.observedRowCount);
  const numericRateDelta = outputNumericRate - sourceNumericRate;
  const numericRatePass = Math.abs(numericRateDelta) <= NULL_RATE_TOLERANCE;

  const meanTolerance = adaptiveSpreadTolerance(NUMERIC_MEAN_SPREAD_TOLERANCE, source.count, output.count);
  const meanNormalizedDelta = Math.abs(output.average - source.average) / robustSpread;
  const meanPass = meanNormalizedDelta <= meanTolerance;

  const quantileKeys = ['p01', 'p05', 'p25', 'p50', 'p75', 'p95', 'p99'];
  const quantileTolerance = adaptiveSpreadTolerance(NUMERIC_QUANTILE_SPREAD_TOLERANCE, source.count, output.count);
  const quantileDeltas = Object.freeze(Object.fromEntries(quantileKeys.map((key) => [
    key,
    Math.abs((outputQuantiles[key] ?? output.median) - (sourceQuantiles[key] ?? source.median)) / robustSpread,
  ])));
  const quantilesPass = quantileKeys.every((key) => quantileDeltas[key] <= (
    key === 'p01' || key === 'p99'
      ? Math.max(quantileTolerance, NUMERIC_TAIL_SPREAD_TOLERANCE)
      : quantileTolerance
  ));

  const expectedTailRows = outputProfile.nonEmptyCount * 0.01;
  const tailsApplicable = expectedTailRows >= MIN_EXPECTED_TAIL_ROWS && sourceRange > 0;
  const tailTolerance = adaptiveSpreadTolerance(NUMERIC_TAIL_SPREAD_TOLERANCE, source.count, output.count);
  const lowerTailDelta = Math.abs((outputQuantiles.p01 ?? output.minimum) - (sourceQuantiles.p01 ?? source.minimum)) / robustSpread;
  const upperTailDelta = Math.abs((outputQuantiles.p99 ?? output.maximum) - (sourceQuantiles.p99 ?? source.maximum)) / robustSpread;
  const tailsPass = !tailsApplicable || (lowerTailDelta <= tailTolerance && upperTailDelta <= tailTolerance);

  const rangePass = output.minimum >= source.minimum && output.maximum <= source.maximum;
  const extremesApplicable = businessFidelity === 'HIGH'
    && outputMeasurement === 'EXACT'
    && sourceProfile.observedRowCount === outputProfile.observedRowCount
    && tailsApplicable;
  const extremesPass = !extremesApplicable
    || (approximateEqual(output.minimum, source.minimum) && approximateEqual(output.maximum, source.maximum));

  return Object.freeze({
    source: Object.freeze({
      uniqueCount: sourceProfile.uniqueCount,
      uniqueCountStatus: sourceProfile.uniqueCountStatus,
      average: source.average,
      minimum: source.minimum,
      maximum: source.maximum,
      quantiles: Object.freeze({ ...sourceQuantiles }),
    }),
    output: Object.freeze({
      uniqueCount: outputProfile.uniqueCount,
      uniqueCountStatus: outputProfile.uniqueCountStatus,
      average: output.average,
      minimum: output.minimum,
      maximum: output.maximum,
      quantiles: Object.freeze({ ...outputQuantiles }),
    }),
    checks: Object.freeze({
      numericRate: Object.freeze({
        pass: numericRatePass,
        sourceRate: sourceNumericRate,
        outputRate: outputNumericRate,
        delta: numericRateDelta,
        tolerance: NULL_RATE_TOLERANCE,
      }),
      uniqueSupport: Object.freeze({ pass: uniqueSupportPass, expectedSupport, minimumExpectedSupport }),
      mean: Object.freeze({ pass: meanPass, normalizedDelta: meanNormalizedDelta, tolerance: meanTolerance }),
      quantiles: Object.freeze({ pass: quantilesPass, normalizedDeltas: quantileDeltas, tolerance: quantileTolerance }),
      tails: Object.freeze({
        pass: tailsPass,
        applicable: tailsApplicable,
        expectedTailRows,
        lowerNormalizedDelta: lowerTailDelta,
        upperNormalizedDelta: upperTailDelta,
        tolerance: tailTolerance,
      }),
      range: Object.freeze({ pass: rangePass }),
      extremes: Object.freeze({ pass: extremesPass, applicable: extremesApplicable }),
    }),
  });
}

function compareColumn({
  sourceProfile,
  outputProfile,
  policy,
  outputMeasurement,
  businessFidelity,
}) {
  const action = policy.selectedAction;
  const expectation = distributionExpectation(action);
  if (!outputProfile || action === 'DROP' || action === 'CLEAR') {
    return Object.freeze({
      columnName: sourceProfile.columnName,
      action,
      expectation,
      status: 'NOT_EVALUATED',
      observations: Object.freeze([action === 'DROP'
        ? 'Column removed by design.'
        : 'Column cleared by design; source distribution is intentionally not preserved.']),
    });
  }

  const observations = [];
  const checks = [];
  let numericMetrics = null;
  const emptyDelta = outputProfile.emptyRatio - sourceProfile.emptyRatio;
  const emptyPass = Math.abs(emptyDelta) <= NULL_RATE_TOLERANCE;
  observations.push(`Empty ${percentage(sourceProfile.emptyRatio)} → ${percentage(outputProfile.emptyRatio)} (${percentagePoints(emptyDelta)})`);
  checks.push(emptyPass);

  if (sourceProfile.uniqueRatio !== null && outputProfile.uniqueRatio !== null) {
    observations.push(`Unique ratio ${percentage(sourceProfile.uniqueRatio)} → ${percentage(outputProfile.uniqueRatio)} (row-count sensitive)`);
  }

  if (expectation === 'PRESERVE' && sourceProfile.numericStats && outputProfile.numericStats) {
    numericMetrics = numericComparisonMetrics({
      sourceProfile,
      outputProfile,
      outputMeasurement,
      businessFidelity,
    });
    observations.push(`Numeric range ${numberValue(sourceProfile.numericStats.minimum)}–${numberValue(sourceProfile.numericStats.maximum)} → ${numberValue(outputProfile.numericStats.minimum)}–${numberValue(outputProfile.numericStats.maximum)}`);
    observations.push(`Numeric rows ${percentage(numericMetrics.checks.numericRate.sourceRate)} → ${percentage(numericMetrics.checks.numericRate.outputRate)} (${percentagePoints(numericMetrics.checks.numericRate.delta)})`);
    observations.push(`Numeric support ${numberValue(sourceProfile.uniqueCount)} → ${numberValue(outputProfile.uniqueCount)} (minimum expected ${numberValue(numericMetrics.checks.uniqueSupport.minimumExpectedSupport)})`);
    observations.push(`Mean ${numberValue(sourceProfile.numericStats.average)} → ${numberValue(outputProfile.numericStats.average)}`);
    observations.push(`P1/P50/P99 ${numberValue(sourceProfile.numericStats.quantiles?.p01)} / ${numberValue(sourceProfile.numericStats.quantiles?.p50 ?? sourceProfile.numericStats.median)} / ${numberValue(sourceProfile.numericStats.quantiles?.p99)} → ${numberValue(outputProfile.numericStats.quantiles?.p01)} / ${numberValue(outputProfile.numericStats.quantiles?.p50 ?? outputProfile.numericStats.median)} / ${numberValue(outputProfile.numericStats.quantiles?.p99)}`);
    checks.push(...Object.values(numericMetrics.checks).map((check) => check.pass));
  } else if (expectation === 'PRESERVE') {
    const distance = categoryDistance(sourceProfile, outputProfile);
    if (distance) {
      observations.push(`Category distribution distance ${percentage(distance.value)} (${distance.measurement.toLocaleLowerCase().replace('_', ' ')})`);
      checks.push(distance.value <= CATEGORY_DISTANCE_TOLERANCE);
    }
  }

  if (expectation === 'SHIFTED') observations.push('Absolute values shifted by design; only missingness is compared.');
  if (expectation === 'STRUCTURE_ONLY') observations.push('Value identities change by design, and source-domain membership changes by design; generated labels are synthetic placeholders, not verified domain values.');

  return Object.freeze({
    columnName: sourceProfile.columnName,
    action,
    expectation,
    status: checks.every(Boolean) ? 'PASS' : 'REVIEW',
    measurement: outputMeasurement,
    ...(numericMetrics ? { numericMetrics } : {}),
    observations: Object.freeze(observations),
  });
}

export function createDistributionComparison({
  sourceTableProfile,
  policies = [],
  generationResult,
  maximumOutputRows = MAX_OUTPUT_PROFILE_ROWS,
} = {}) {
  if (!sourceTableProfile || !generationResult) return null;
  if (!Number.isInteger(maximumOutputRows) || maximumOutputRows < 1) {
    throw new RangeError('maximumOutputRows must be a positive integer.');
  }
  const output = profileOutput(generationResult, maximumOutputRows);
  const outputProfiles = new Map(output.tableProfile.columns.map((profile) => [profile.columnName, profile]));
  const policyByName = new Map(policies.map((policy) => [policy.columnName, policy]));
  const columns = sourceTableProfile.columns.map((sourceProfile) => compareColumn({
    sourceProfile,
    outputProfile: outputProfiles.get(sourceProfile.columnName) ?? null,
    policy: policyByName.get(sourceProfile.columnName) ?? { selectedAction: 'KEEP' },
    outputMeasurement: output.measurement,
    businessFidelity: generationResult.statistics?.businessFidelity ?? null,
  }));
  const reviewColumnCount = columns.filter((column) => column.status === 'REVIEW').length;
  const comparableColumnCount = columns.filter((column) => column.status !== 'NOT_EVALUATED').length;
  const domainChangedColumnCount = columns.filter((column) => column.expectation === 'STRUCTURE_ONLY').length;
  return Object.freeze({
    status: reviewColumnCount > 0 ? 'REVIEW' : comparableColumnCount > 0 ? 'PASS' : 'NOT_EVALUATED',
    measurement: output.measurement,
    profiledOutputRows: output.profiledRowCount,
    totalOutputRows: output.totalRowCount,
    comparableColumnCount,
    reviewColumnCount,
    expectedChangeColumnCount: columns.filter((column) => column.expectation !== 'PRESERVE').length,
    domainChangedColumnCount,
    columns: Object.freeze(columns),
    thresholds: Object.freeze({
      emptyRatePercentagePoints: NULL_RATE_TOLERANCE * 100,
      categoryDistancePercent: CATEGORY_DISTANCE_TOLERANCE * 100,
      numericMedianSourceRangePercent: NUMERIC_MEDIAN_RANGE_TOLERANCE * 100,
      numericSupportMinimumPercent: NUMERIC_SUPPORT_MINIMUM_FRACTION * 100,
      numericMeanRobustSpreadPercent: NUMERIC_MEAN_SPREAD_TOLERANCE * 100,
      numericQuantileRobustSpreadPercent: NUMERIC_QUANTILE_SPREAD_TOLERANCE * 100,
      numericTailRobustSpreadPercent: NUMERIC_TAIL_SPREAD_TOLERANCE * 100,
      minimumExpectedTailRows: MIN_EXPECTED_TAIL_ROWS,
    }),
    boundary: 'This is a univariate comparison. It does not measure multivariate similarity, privacy, or disclosure risk.',
  });
}
