import { createContractWarning } from '../core/contracts.js';
import {
  createColumnProfiler,
  resolveProfileLimits,
} from './profile-column.js';
import { truncateForTracking } from './value-normalization.js';

/**
 * Creates an incremental table profiler. It retains column profilers but never
 * stores the original two-dimensional row collection.
 *
 * @param {Object} [options]
 * @param {string[]} [options.headers]
 * @param {import('./profile-column.js').DEFAULT_PROFILE_LIMITS} [options.limits]
 */
export function createTableProfiler({ headers = [], limits: limitOverrides } = {}) {
  if (!Array.isArray(headers)) throw new TypeError('headers must be an array.');
  const limits = resolveProfileLimits(limitOverrides);
  const profilers = [];
  let rowCount = 0;
  let columnsTruncated = false;

  const addColumn = (columnIndex, initialEmptyCount = 0) => {
    if (columnIndex >= limits.maxColumns) {
      columnsTruncated = true;
      return null;
    }
    const suppliedName = headers[columnIndex];
    const columnName = truncateForTracking(
      String(suppliedName || `column_${columnIndex + 1}`),
      limits.maxColumnNameLength,
    ).value;
    const profiler = createColumnProfiler({
      columnIndex,
      columnName,
      limits,
      initialEmptyCount,
    });
    profilers.push(profiler);
    return profiler;
  };

  for (let index = 0; index < Math.min(headers.length, limits.maxColumns); index += 1) {
    addColumn(index);
  }
  if (headers.length > limits.maxColumns) columnsTruncated = true;

  /** @param {readonly unknown[]} row */
  const updateRow = (row) => {
    if (!Array.isArray(row)) throw new TypeError('row must be an array.');
    const previousRowCount = rowCount;
    rowCount += 1;
    const wantedColumns = Math.min(Math.max(profilers.length, row.length), limits.maxColumns);
    while (profilers.length < wantedColumns) addColumn(profilers.length, previousRowCount);
    if (row.length > limits.maxColumns) columnsTruncated = true;
    for (let index = 0; index < profilers.length; index += 1) {
      profilers[index].update(index < row.length ? row[index] : undefined);
    }
  };

  const finalize = () => {
    const warnings = [];
    if (columnsTruncated) {
      warnings.push(createContractWarning(
        'COLUMN_PROFILE_LIMIT_REACHED',
        'Columns beyond the configured profile limit were not retained.',
        { maxColumns: limits.maxColumns },
      ));
    }
    const columns = Object.freeze(profilers.map((profiler) => profiler.finalize()));
    const memory = profilers.map((profiler) => profiler.memorySummary());
    const totalTrackedEntries = memory.reduce(
      (total, summary) => total + Object.values(summary).reduce((sum, value) => sum + value, 0),
      0,
    );
    return Object.freeze({
      rowCount,
      columnCount: columns.length,
      columns,
      warnings: Object.freeze(warnings),
      limits,
      memory: Object.freeze({
        allocatedColumnProfilers: profilers.length,
        totalTrackedEntries,
        perColumn: Object.freeze(memory),
      }),
    });
  };

  return Object.freeze({ updateRow, finalize, limits });
}

/**
 * Convenience wrapper for a synchronous or asynchronous row iterable.
 *
 * @param {Iterable<readonly unknown[]>|AsyncIterable<readonly unknown[]>} rows
 * @param {Parameters<typeof createTableProfiler>[0]} [options]
 */
export async function profileTable(rows, options = {}) {
  if (!rows || (typeof rows[Symbol.iterator] !== 'function' && typeof rows[Symbol.asyncIterator] !== 'function')) {
    throw new TypeError('rows must be an iterable or async iterable.');
  }
  const profiler = createTableProfiler(options);
  for await (const row of rows) profiler.updateRow(row);
  return profiler.finalize();
}
