export const INPUT_SIZE_LEVELS = Object.freeze({
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE',
  VERY_LARGE: 'VERY_LARGE',
});

export const SAFE_FALLBACK_MAX_BYTES = 5 * 1024 * 1024;
export const STRONG_WARNING_BYTES = 100 * 1024 * 1024;
export const LARGE_CELL_ESTIMATE = 4_000_000;
export const OUTPUT_CONFIRM_CELL_ESTIMATE = 500_000;
export const OUTPUT_CONFIRM_ROW_ESTIMATE = 50_000;

export function estimateTextBytes(text) {
  if (typeof text !== 'string') return null;
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
  return text.length * 2;
}

export function classifyInputSize({ bytes = null, rowCount = null, columnCount = null } = {}) {
  const safeBytes = Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  const cells = Number.isFinite(rowCount) && Number.isFinite(columnCount)
    ? Math.max(0, rowCount) * Math.max(0, columnCount)
    : null;
  let level = INPUT_SIZE_LEVELS.SMALL;
  if ((safeBytes !== null && safeBytes >= STRONG_WARNING_BYTES) || (cells !== null && cells >= 8_000_000)) {
    level = INPUT_SIZE_LEVELS.VERY_LARGE;
  } else if ((safeBytes !== null && safeBytes >= 25 * 1024 * 1024) || (cells !== null && cells >= LARGE_CELL_ESTIMATE)) {
    level = INPUT_SIZE_LEVELS.LARGE;
  } else if ((safeBytes !== null && safeBytes > SAFE_FALLBACK_MAX_BYTES) || (cells !== null && cells >= 500_000)) {
    level = INPUT_SIZE_LEVELS.MEDIUM;
  }

  const warnings = [];
  if (safeBytes !== null && safeBytes >= STRONG_WARNING_BYTES) {
    warnings.push('This input is at least 100 MB. Processing may take significant time and memory, but the tool will not assume failure.');
  } else if (level === INPUT_SIZE_LEVELS.LARGE || level === INPUT_SIZE_LEVELS.VERY_LARGE) {
    warnings.push('This is a large input. Worker processing and bounded statistics are required.');
  }

  return Object.freeze({
    level,
    bytes: safeBytes,
    estimatedCells: cells,
    workerRecommended: level !== INPUT_SIZE_LEVELS.SMALL,
    mainThreadFallbackAllowed: safeBytes !== null
      ? safeBytes <= SAFE_FALLBACK_MAX_BYTES
      : level === INPUT_SIZE_LEVELS.SMALL,
    warnings: Object.freeze(warnings),
  });
}

export function assertSafeFallback(sizePolicy) {
  if (!sizePolicy?.mainThreadFallbackAllowed) {
    throw new Error('Inline Worker is unavailable and this input exceeds the safe main-thread fallback limit. Use a smaller file or a browser with Worker support.');
  }
  return true;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

/**
 * Estimates generation work from the rows and enabled columns that will
 * actually be produced. This is a confirmation aid, not a hard limit.
 */
export function estimateGenerationCost({
  requestedRowCount = 0,
  columnCount = 0,
  tables = [],
} = {}) {
  const tablePlans = Array.isArray(tables) && tables.length > 0
    ? tables.map((table) => Object.freeze({
      rowCount: positiveInteger(table?.rowCount) || positiveInteger(requestedRowCount),
      columnCount: positiveInteger(table?.columnCount),
    }))
    : [Object.freeze({
      rowCount: positiveInteger(requestedRowCount),
      columnCount: positiveInteger(columnCount),
    })];
  const totalRows = tablePlans.reduce((total, table) => total + table.rowCount, 0);
  const estimatedCells = tablePlans.reduce(
    (total, table) => total + (table.rowCount * table.columnCount),
    0,
  );
  const requiresConfirmation = estimatedCells >= OUTPUT_CONFIRM_CELL_ESTIMATE
    || totalRows >= OUTPUT_CONFIRM_ROW_ESTIMATE;

  return Object.freeze({
    tableCount: tablePlans.length,
    totalRows,
    estimatedCells,
    requiresConfirmation,
    tablePlans: Object.freeze(tablePlans),
  });
}

export function generationCostConfirmationMessage(cost) {
  if (!cost?.requiresConfirmation) return '';
  const tableText = cost.tableCount === 1
    ? '1 table'
    : `${cost.tableCount.toLocaleString('en-AU')} tables`;
  return `This is a large local generation: ${cost.totalRows.toLocaleString('en-AU')} total rows across ${tableText}, about ${cost.estimatedCells.toLocaleString('en-AU')} cells. It may take significant time or memory. Continue?`;
}
