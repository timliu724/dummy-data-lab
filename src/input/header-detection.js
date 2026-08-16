import { parseTemporal } from '../temporal/temporal-value.js';

/** @param {string} value */
function valueShape(value) {
  const trimmed = value.trim();
  if (trimmed === '') return 'EMPTY';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return 'NUMBER';
  if (/^(?:true|false|yes|no)$/i.test(trimmed)) return 'BOOLEAN';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) return 'EMAIL';
  const temporal = parseTemporal(trimmed);
  if (temporal) return temporal.kind;
  return 'TEXT';
}

/** @param {string} value */
function looksLikeHeaderLabel(value) {
  const trimmed = value.trim();
  return /^[\p{L}_][\p{L}\p{N} _.-]*$/u.test(trimmed) && !/^\d+$/.test(trimmed);
}

const HEADER_WORDS = new Set([
  'id', 'name', 'first', 'last', 'full', 'status', 'type', 'code', 'description', 'category',
  'email', 'phone', 'mobile', 'address', 'street', 'suburb', 'city', 'state', 'country',
  'postcode', 'postal', 'zip', 'date', 'time', 'amount', 'price', 'currency', 'quantity',
  'total', 'notes', 'note', 'comment', 'account', 'customer', 'client', 'product', 'order',
]);

/** @param {string} value */
function hasHeaderLexicalSignal(value) {
  const trimmed = value.trim();
  if (!looksLikeHeaderLabel(trimmed)) return false;
  const separated = trimmed.replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2');
  const words = separated.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((word) => HEADER_WORDS.has(word))) return true;
  return words.length >= 2 && /[_\-.]/.test(trimmed);
}

/** @param {string[]} values */
function modalShape(values) {
  const counts = new Map();
  let bestShape = 'EMPTY';
  let bestCount = 0;
  for (const value of values) {
    const shape = valueShape(value);
    if (shape === 'EMPTY') continue;
    const count = (counts.get(shape) ?? 0) + 1;
    counts.set(shape, count);
    if (count > bestCount) {
      bestShape = shape;
      bestCount = count;
    }
  }
  return bestShape;
}

/**
 * Detects whether the first logical row is probably a header. Ambiguous input
 * is returned as ambiguous rather than silently promoted to a header.
 *
 * @param {readonly (readonly string[])[]} rows
 */
export function detectHeader(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array.');
  if (rows.length < 2 || !Array.isArray(rows[0]) || rows[0].length === 0) {
    return Object.freeze({
      decision: 'ambiguous',
      confidence: 'LOW',
      yesScore: 0,
      noScore: 0,
      evidence: Object.freeze(['At least two non-empty logical rows are needed for header detection.']),
      warnings: Object.freeze([{ code: 'HEADER_SAMPLE_TOO_SMALL', message: 'Header detection needs user review.' }]),
    });
  }

  const first = rows[0].map((value) => String(value));
  const later = rows.slice(1);
  const width = first.length;
  const nonEmptyRatio = first.filter((value) => value.trim() !== '').length / width;
  const uniquenessRatio = new Set(first.map((value) => value.trim().toLocaleLowerCase())).size / width;
  const labelRatio = first.filter(looksLikeHeaderLabel).length / width;
  const headerSignalRatio = first.filter(hasHeaderLexicalSignal).length / width;
  const laterCellValues = later.flatMap((row) => Array.isArray(row) ? row.slice(0, width).map(String) : []);
  const laterHeaderSignalRatio = laterCellValues.length === 0
    ? 0
    : laterCellValues.filter(hasHeaderLexicalSignal).length / laterCellValues.length;
  const headerSignalGap = headerSignalRatio - laterHeaderSignalRatio;
  const firstDataLikeRatio = first.filter((value) => (
    ['NUMBER', 'BOOLEAN', 'EMAIL', 'DATE', 'TIME', 'DATETIME'].includes(valueShape(value))
  )).length / width;

  let comparableColumns = 0;
  let shapeMismatchColumns = 0;
  let sameShapeColumns = 0;
  for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
    const laterValues = later
      .filter((row) => Array.isArray(row) && columnIndex < row.length)
      .map((row) => String(row[columnIndex]));
    const laterShape = modalShape(laterValues);
    if (laterShape === 'EMPTY') continue;
    comparableColumns += 1;
    if (valueShape(first[columnIndex]) !== laterShape) shapeMismatchColumns += 1;
    else sameShapeColumns += 1;
  }

  const mismatchRatio = comparableColumns ? shapeMismatchColumns / comparableColumns : 0;
  const sameShapeRatio = comparableColumns ? sameShapeColumns / comparableColumns : 0;
  const yesScore = Number((labelRatio * 0.25 + mismatchRatio * 0.4 + headerSignalRatio * 0.2 + nonEmptyRatio * 0.1 + uniquenessRatio * 0.05).toFixed(4));
  const noScore = Number((firstDataLikeRatio * 0.55 + sameShapeRatio * 0.35 + (1 - labelRatio) * 0.1).toFixed(4));

  let decision = 'ambiguous';
  let confidence = 'LOW';
  if (headerSignalRatio >= 0.5 && headerSignalGap >= 0.25 && nonEmptyRatio >= 0.8 && uniquenessRatio >= 0.8) {
    decision = 'yes';
    confidence = headerSignalRatio >= 0.75 && headerSignalGap >= 0.5 ? 'HIGH' : 'MEDIUM';
  } else if (labelRatio >= 0.5 && mismatchRatio >= 0.5 && yesScore - noScore >= 0.2) {
    decision = 'yes';
    confidence = mismatchRatio >= 0.75 && labelRatio >= 0.75 ? 'HIGH' : 'MEDIUM';
  } else if (firstDataLikeRatio >= 0.5 && sameShapeRatio >= 0.5 && noScore - yesScore >= 0.15) {
    decision = 'no';
    confidence = firstDataLikeRatio >= 0.75 ? 'HIGH' : 'MEDIUM';
  }

  const warnings = decision === 'ambiguous'
    ? [{ code: 'HEADER_AMBIGUOUS', message: 'The first row is retained as data until the user chooses.' }]
    : [];

  return Object.freeze({
    decision,
    confidence,
    yesScore,
    noScore,
    evidence: Object.freeze([
      `${(labelRatio * 100).toFixed(1)}% of first-row values looked like labels.`,
      `${(headerSignalRatio * 100).toFixed(1)}% had header words or machine-readable header structure versus ${(laterHeaderSignalRatio * 100).toFixed(1)}% in later cells.`,
      `${(mismatchRatio * 100).toFixed(1)}% of comparable columns changed value shape after the first row.`,
      `${(firstDataLikeRatio * 100).toFixed(1)}% of first-row values looked data-like.`,
      `${(sameShapeRatio * 100).toFixed(1)}% of comparable columns kept the same value shape.`,
    ]),
    warnings: Object.freeze(warnings.map((warning) => Object.freeze(warning))),
  });
}
