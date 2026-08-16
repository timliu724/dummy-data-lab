const ONLY_IDENTIFIER_CHARACTERS = /^[\d\s-]+$/u;

function compactDigits(value) {
  const text = String(value ?? '').trim();
  if (!ONLY_IDENTIFIER_CHARACTERS.test(text)) return null;
  return text.replaceAll(/[^\d]/g, '');
}

function allowlistKey(value) {
  const text = String(value ?? '').trim();
  const digits = compactDigits(text);
  return digits && digits.length >= 8 ? `digits:${digits}` : `text:${text.toLocaleLowerCase()}`;
}

export function normalizeRecognitionAllowlist(values = []) {
  if (!Array.isArray(values)) throw new TypeError('Recognition allowlist must be an array.');
  return Object.freeze([...new Set(values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((value) => allowlistKey(value.slice(0, 128))))]);
}

function weightedRemainder(digits, weights, modulus, transform = (value) => value) {
  if (digits.length !== weights.length) return null;
  const total = weights.reduce((sum, weight, index) => (
    sum + transform(Number(digits[index]), index) * weight
  ), 0);
  return total % modulus;
}

export function isValidAustralianBusinessNumber(value) {
  const digits = compactDigits(value);
  if (!digits || digits.length !== 11 || digits.startsWith('0')) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return weightedRemainder(digits, weights, 89, (digit, index) => index === 0 ? digit - 1 : digit) === 0;
}

export function isValidAustralianCompanyNumber(value) {
  const digits = compactDigits(value);
  if (!digits || digits.length !== 9) return false;
  const remainder = weightedRemainder(digits.slice(0, 8), [8, 7, 6, 5, 4, 3, 2, 1], 10);
  return (10 - remainder) % 10 === Number(digits[8]);
}

export function isValidAustralianTaxFileNumber(value) {
  const digits = compactDigits(value);
  if (!digits || digits.length !== 9) return false;
  return weightedRemainder(digits, [1, 4, 3, 7, 5, 8, 6, 9, 10], 11) === 0;
}

export function isValidAustralianMedicareNumber(value) {
  const digits = compactDigits(value);
  if (!digits || digits.length !== 10 || !/^[2-6]/.test(digits)) return false;
  const remainder = weightedRemainder(digits.slice(0, 8), [1, 3, 7, 9, 1, 3, 7, 9], 10);
  return remainder === Number(digits[8]);
}

function normalizedContext(value) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchingContextTerms(columnName, terms) {
  const normalized = ` ${normalizedContext(columnName)} `;
  return terms.filter((term) => normalized.includes(` ${normalizedContext(term)} `));
}

export const AU_IDENTIFIER_RECOGNIZERS = Object.freeze([
  Object.freeze({
    id: 'AU_ABN',
    label: 'Australian Business Number',
    validator: isValidAustralianBusinessNumber,
    context: Object.freeze(['abn', 'australian business number', 'business number']),
    digitLength: 11,
  }),
  Object.freeze({
    id: 'AU_ACN',
    label: 'Australian Company Number',
    validator: isValidAustralianCompanyNumber,
    context: Object.freeze(['acn', 'australian company number', 'company number']),
    digitLength: 9,
  }),
  Object.freeze({
    id: 'AU_TFN',
    label: 'Australian Tax File Number',
    validator: isValidAustralianTaxFileNumber,
    context: Object.freeze(['tfn', 'tax file number']),
    digitLength: 9,
  }),
  Object.freeze({
    id: 'AU_MEDICARE',
    label: 'Australian Medicare number',
    validator: isValidAustralianMedicareNumber,
    context: Object.freeze(['medicare', 'medicare number', 'medicare card']),
    digitLength: 10,
  }),
]);

export class AustralianIdentifierRecognizerRegistry {
  constructor(recognizers = AU_IDENTIFIER_RECOGNIZERS) {
    if (!Array.isArray(recognizers) || recognizers.length === 0) {
      throw new TypeError('At least one Australian identifier recognizer is required.');
    }
    this.recognizers = Object.freeze([...recognizers]);
  }

  listRecognizers() {
    return this.recognizers;
  }

  /** @param {import('../core/contracts.js').ColumnProfile} profile */
  detect(profile, { allowlist = [] } = {}) {
    const values = (profile.sampleValues ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (values.length === 0) return null;
    const allowed = new Set(normalizeRecognitionAllowlist(allowlist));
    const checkedValues = values.filter((value) => !allowed.has(allowlistKey(value)));
    const allowlistedSampleCount = values.length - checkedValues.length;
    if (checkedValues.length === 0) return null;

    const candidates = this.recognizers.flatMap((recognizer) => {
      if (!checkedValues.every(recognizer.validator)) return [];
      const contextTerms = matchingContextTerms(profile.columnName, recognizer.context);
      return [Object.freeze({ recognizer, contextTerms })];
    });
    if (candidates.length === 0) return null;

    const contextual = candidates.filter((candidate) => candidate.contextTerms.length > 0);
    const eligible = contextual.length > 0 ? contextual : candidates;
    if (eligible.length !== 1) return null;

    const { recognizer, contextTerms } = eligible[0];
    const contextConfirmed = contextTerms.length > 0;
    return Object.freeze({
      detector: 'au-identifier-recognizer',
      type: recognizer.id,
      score: contextConfirmed ? 100 : 96,
      confidence: contextConfirmed ? 'HIGH' : 'MEDIUM',
      evidence: Object.freeze([
        `All ${checkedValues.length} checked bounded samples matched the ${recognizer.digitLength}-digit ${recognizer.label} format and checksum.`,
        contextConfirmed
          ? `The column name contained the context term ${contextTerms[0]}.`
          : 'No matching column-name context was present; checksum evidence identified the field.',
        ...(allowlistedSampleCount > 0
          ? [`${allowlistedSampleCount} bounded sample${allowlistedSampleCount === 1 ? ' was' : 's were'} excluded by the in-memory recognition allowlist.`]
          : []),
      ]),
      warnings: Object.freeze([]),
      reviewRequired: !contextConfirmed,
      details: Object.freeze({
        jurisdiction: 'AU',
        recognizerId: recognizer.id,
        recognizerLabel: recognizer.label,
        checksumValidated: true,
        matchedSampleCount: checkedValues.length,
        sampledValueCount: values.length,
        allowlistedSampleCount,
        contextConfirmed,
        contextTerms: Object.freeze(contextTerms),
      }),
    });
  }
}

const DEFAULT_REGISTRY = new AustralianIdentifierRecognizerRegistry();

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectAustralianIdentifier(profile, options = {}) {
  return DEFAULT_REGISTRY.detect(profile, options);
}
