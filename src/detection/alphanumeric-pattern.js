/**
 * @param {import('../core/contracts.js').ColumnProfile} profile
 * @param {Object} context
 */
export function detectAlphanumericPattern(profile, context) {
  const values = (profile.sampleValues ?? []).map(String);
  const isCode = (value) => (
    /^[\p{L}\p{N}_./-]+$/u.test(value) &&
    /\p{L}/u.test(value) &&
    /\p{N}/u.test(value)
  );
  if (values.length === 0 || !values.every(isCode)) return null;
  const dominantCoverage = context.pattern.dominantShape?.coverage ?? 0;
  const confidence = dominantCoverage >= 0.8 && values.length >= 3 ? 'HIGH' : 'MEDIUM';
  return Object.freeze({
    detector: 'alphanumeric-pattern',
    type: 'ALPHANUMERIC_CODE',
    score: 88,
    confidence,
    evidence: Object.freeze([
      `All ${values.length} pattern samples combined letters and digits without spaces.`,
      `The dominant positional shape covered ${(dominantCoverage * 100).toFixed(1)}% of pattern samples.`,
      `Pattern statistics used ${context.pattern.sampleSize} bounded values.`,
    ]),
    warnings: Object.freeze([]),
    reviewRequired: confidence !== 'HIGH',
    details: Object.freeze({ pattern: context.pattern }),
  });
}
