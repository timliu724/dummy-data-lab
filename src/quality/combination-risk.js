const DEFAULT_MINIMUM_GROUP_SIZE = 3;
const MAXIMUM_EXACT_ROWS = 50_000;

function result(values) {
  return Object.freeze({
    minimumGroupSize: DEFAULT_MINIMUM_GROUP_SIZE,
    quasiIdentifierColumns: Object.freeze([]),
    checkedRowCount: 0,
    distinctCombinationCount: 0,
    smallestGroupSize: null,
    smallGroupCount: 0,
    rowsInSmallGroups: 0,
    rowsInSmallGroupsPercent: 0,
    measurement: 'NOT_APPLICABLE',
    status: 'NOT_APPLICABLE',
    summary: 'No combination check is available.',
    boundary: 'This informational output-only check is not a k-anonymity guarantee or a formal re-identification assessment. Public lookup or aggregate data is not, by itself, evidence of personal re-identification risk.',
    ...values,
  });
}

function combinationKey(row, indexes) {
  return indexes.map((index) => {
    const value = String(row[index] ?? '');
    return `${value.length}:${value}`;
  }).join('|');
}

export function createCombinationRiskCheck({
  policies = [],
  generationResult,
  minimumGroupSize = DEFAULT_MINIMUM_GROUP_SIZE,
  maximumExactRows = MAXIMUM_EXACT_ROWS,
} = {}) {
  if (!generationResult) throw new TypeError('generationResult is required.');
  if (!Number.isInteger(minimumGroupSize) || minimumGroupSize < 2) {
    throw new RangeError('minimumGroupSize must be an integer of at least 2.');
  }
  if (!Number.isInteger(maximumExactRows) || maximumExactRows < 1) {
    throw new RangeError('maximumExactRows must be a positive integer.');
  }

  const headerIndexes = new Map(generationResult.headers.map((header, index) => [header, index]));
  const quasiIdentifierColumns = policies
    .filter((policy) => policy.attributeRole === 'QUASI_IDENTIFIER'
      && !['DROP', 'CLEAR'].includes(policy.selectedAction)
      && headerIndexes.has(policy.columnName))
    .map((policy) => policy.columnName);
  const indexes = quasiIdentifierColumns.map((columnName) => headerIndexes.get(columnName));

  if (indexes.length < 2) {
    return result({
      minimumGroupSize,
      quasiIdentifierColumns: Object.freeze(quasiIdentifierColumns),
      summary: 'Combination check needs at least two quasi-identifier columns in the output.',
    });
  }
  if (generationResult.rows.length === 0) {
    return result({
      minimumGroupSize,
      quasiIdentifierColumns: Object.freeze(quasiIdentifierColumns),
      summary: 'Combination check needs at least one output row.',
    });
  }
  if (generationResult.rows.length > maximumExactRows) {
    return result({
      minimumGroupSize,
      quasiIdentifierColumns: Object.freeze(quasiIdentifierColumns),
      measurement: 'NOT_COMPUTED',
      status: 'NOT_APPLICABLE',
      summary: `Combination check is not computed above ${maximumExactRows.toLocaleString('en-AU')} rows to avoid a misleading sample result.`,
    });
  }

  const counts = new Map();
  for (const row of generationResult.rows) {
    const key = combinationKey(row, indexes);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const groupSizes = [...counts.values()];
  const smallestGroupSize = Math.min(...groupSizes);
  const smallGroups = groupSizes.filter((count) => count < minimumGroupSize);
  const rowsInSmallGroups = smallGroups.reduce((total, count) => total + count, 0);
  const rowsInSmallGroupsPercent = rowsInSmallGroups / generationResult.rows.length;
  const status = rowsInSmallGroups > 0 ? 'CHECK' : 'PASS';
  const columnLabel = quasiIdentifierColumns.join(' + ');
  const summary = status === 'PASS'
    ? `Every ${columnLabel} combination is shared by at least ${minimumGroupSize} output rows.`
    : `${rowsInSmallGroups} of ${generationResult.rows.length} output rows belong to ${columnLabel} combinations shared by fewer than ${minimumGroupSize} rows.`;

  return result({
    minimumGroupSize,
    quasiIdentifierColumns: Object.freeze(quasiIdentifierColumns),
    checkedRowCount: generationResult.rows.length,
    distinctCombinationCount: counts.size,
    smallestGroupSize,
    smallGroupCount: smallGroups.length,
    rowsInSmallGroups,
    rowsInSmallGroupsPercent,
    measurement: 'EXACT',
    status,
    summary,
  });
}
