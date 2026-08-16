const BOOLEAN_TOKENS = new Set(['true', 'false', 'yes', 'no', 'y', 'n', '1', '0', 'on', 'off']);

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectCategoryOrBoolean(profile) {
  const values = (profile.sampleValues ?? []).map((value) => String(value).trim().toLocaleLowerCase());
  if (values.length === 0) return null;
  if (values.every((value) => BOOLEAN_TOKENS.has(value)) && (profile.uniqueCount ?? 0) <= 4) {
    const numericOnly = values.every((value) => value === '0' || value === '1');
    return Object.freeze({
      detector: 'category-boolean',
      type: 'BOOLEAN',
      score: numericOnly ? 86 : 96,
      confidence: numericOnly ? 'LOW' : 'HIGH',
      evidence: Object.freeze([
        `All ${values.length} bounded samples matched a known Boolean token.`,
        `The profile observed ${profile.uniqueCount} unique values with status ${profile.uniqueCountStatus}.`,
      ]),
      warnings: Object.freeze(numericOnly ? [{
        code: 'BOOLEAN_NUMERIC_AMBIGUITY',
        message: 'Values 0 and 1 may be Boolean flags or ordinary integers.',
        details: Object.freeze({}),
      }] : []),
      reviewRequired: numericOnly,
      details: Object.freeze({ numericOnly }),
    });
  }

  const uniqueCount = profile.uniqueCount ?? Number.POSITIVE_INFINITY;
  const uniqueRatio = profile.uniqueRatio ?? 1;
  const categoryLimit = Math.max(10, Math.min(50, Math.ceil(Math.sqrt(profile.nonEmptyCount || 1) * 2)));
  if (
    profile.uniqueCountStatus === 'EXACT' &&
    uniqueCount <= categoryLimit &&
    uniqueRatio <= 0.2
  ) {
    const confidence = profile.nonEmptyCount >= 20 ? 'HIGH' : 'MEDIUM';
    return Object.freeze({
      detector: 'category-boolean',
      type: 'CATEGORY',
      score: 68,
      confidence,
      evidence: Object.freeze([
        `${uniqueCount} exact unique values were observed across ${profile.nonEmptyCount} non-empty rows.`,
        `The unique ratio was ${(uniqueRatio * 100).toFixed(2)}%.`,
      ]),
      warnings: Object.freeze([]),
      reviewRequired: confidence !== 'HIGH',
      details: Object.freeze({ categoryLimit }),
    });
  }
  return null;
}
