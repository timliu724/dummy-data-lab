import { parseNumericToken } from '../profile/value-normalization.js';

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectBasicType(profile) {
  if (profile.nonEmptyCount === 0) {
    return Object.freeze({
      detector: 'basic-types',
      type: 'EMPTY',
      score: 100,
      confidence: 'HIGH',
      evidence: Object.freeze([`All ${profile.observedRowCount} observed values were empty.`]),
      warnings: Object.freeze([]),
      reviewRequired: false,
      details: Object.freeze({}),
    });
  }

  const values = (profile.sampleValues ?? []).map(String);
  if (values.length === 0) return null;
  const numeric = values.map(parseNumericToken);
  if (numeric.some((entry) => entry === null)) return null;
  const kinds = new Set(numeric.map((entry) => entry.kind));
  let type;
  if (kinds.size === 1 && kinds.has('PERCENTAGE')) type = 'PERCENTAGE';
  else if (kinds.size === 1 && kinds.has('CURRENCY_LIKE')) type = 'CURRENCY_LIKE';
  else if ([...kinds].every((kind) => kind === 'INTEGER')) type = 'INTEGER';
  else if ([...kinds].every((kind) => ['INTEGER', 'DECIMAL'].includes(kind))) type = 'DECIMAL';
  else return null;

  const confidence = values.length >= 3 ? 'HIGH' : 'MEDIUM';
  return Object.freeze({
    detector: 'basic-types',
    type,
    score: 80,
    confidence,
    evidence: Object.freeze([
      `${values.length} of ${values.length} bounded sample values matched ${type}.`,
      `Numeric statistics covered ${profile.numericStats?.count ?? 0} non-empty values.`,
    ]),
    warnings: Object.freeze([]),
    reviewRequired: confidence !== 'HIGH',
    details: Object.freeze({ observedKinds: Object.freeze([...kinds]) }),
  });
}
