import { parseDelimited } from '../input/parse-delimited.js';

export const SOURCE_COMPARISON_LIMIT = 100;

/**
 * Re-scans the local input only when the user asks to compare. It retains at
 * most the bounded source rows referenced by the generated preview and never
 * writes them to storage, logs, exports, or the public OutputPlan.
 */
export async function collectSourceComparison({
  input,
  parseOptions = {},
  sourceRowIndexes = [],
  expectedHeaders = [],
  limit = SOURCE_COMPARISON_LIMIT,
}) {
  if (!Number.isInteger(limit) || limit <= 0 || limit > SOURCE_COMPARISON_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 to ${SOURCE_COMPARISON_LIMIT}.`);
  }
  const requested = [...new Set(sourceRowIndexes
    .filter((value) => Number.isInteger(value) && value >= 0))]
    .slice(0, limit);
  const pending = new Set(requested);
  const found = new Map();
  if (pending.size === 0) {
    return Object.freeze({ headers: Object.freeze([]), rows: Object.freeze([]), requestedCount: 0 });
  }

  const parsed = await parseDelimited(input, {
    ...parseOptions,
    collectRows: false,
    onRow(row, context) {
      if (!pending.has(context.sourceRowIndex)) return true;
      found.set(context.sourceRowIndex, Object.freeze([...row]));
      pending.delete(context.sourceRowIndex);
      return pending.size > 0;
    },
  });

  const inferredColumnCount = Math.max(0, ...[...found.values()].map((row) => row.length));
  const comparisonHeaders = parsed.headers.length > 0
    ? parsed.headers
    : expectedHeaders.length > 0
      ? Object.freeze([...expectedHeaders])
      : Object.freeze(Array.from({ length: inferredColumnCount }, (_, index) => `column_${index + 1}`));

  return Object.freeze({
    headers: comparisonHeaders,
    rows: Object.freeze(requested.flatMap((sourceRowIndex) => {
      const row = found.get(sourceRowIndex);
      return row ? [Object.freeze({ sourceRowIndex, row })] : [];
    })),
    requestedCount: requested.length,
  });
}
