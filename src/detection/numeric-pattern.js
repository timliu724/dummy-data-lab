/** @param {string} columnName */
function hasIdentifierHint(columnName) {
  return /(^|[_\s-])(id|identifier|reference|ref|account|number|no)([_\s-]|$)/i.test(columnName);
}

/**
 * @param {import('../core/contracts.js').ColumnProfile} profile
 * @param {Object} context
 */
export function detectNumericPattern(profile, context) {
  const values = (profile.sampleValues ?? []).map(String);
  if (values.length === 0 || !values.every((value) => /^\d+$/.test(value))) return null;
  const lengths = new Set(values.map((value) => value.length));
  const leadingZero = values.some((value) => value.length > 1 && value.startsWith('0'));
  const identifierHint = hasIdentifierHint(profile.columnName ?? '');
  const highlyUnique = (profile.uniqueRatio ?? 0) >= 0.8;
  if (!identifierHint && !leadingZero && !highlyUnique) return null;

  const lengthPattern = lengths.size === 1 ? 'FIXED_LENGTH_DIGITS' : 'VARIABLE_LENGTH_DIGITS';
  const score = identifierHint || leadingZero ? 92 : 72;
  const confidence = identifierHint && (leadingZero || highlyUnique) ? 'HIGH' : 'MEDIUM';
  return Object.freeze({
    detector: 'numeric-pattern',
    type: 'NUMERIC_ID',
    score,
    confidence,
    evidence: Object.freeze([
      `All ${values.length} pattern samples contained digits only.`,
      `Digit length was ${lengthPattern === 'FIXED_LENGTH_DIGITS' ? `fixed at ${values[0].length}` : 'variable'}.`,
      `Profile uniqueness status was ${profile.uniqueCountStatus} with ratio ${(profile.uniqueRatio ?? 0).toFixed(4)}.`,
      identifierHint ? 'The column name contained an identifier hint.' : 'No identifier name hint was available.',
    ]),
    warnings: Object.freeze([]),
    reviewRequired: confidence !== 'HIGH',
    details: Object.freeze({
      lengthPattern,
      leadingZero,
      identifierHint,
      pattern: context.pattern,
    }),
  });
}
