import { normalizeHeader } from './header-normalization.js';

/** @param {string} columnName @param {readonly string[]} tokens */
function hasColumnHint(columnName, tokens) {
  const normalized = normalizeHeader(columnName).replaceAll('_', ' ');
  const words = new Set(normalized.split(/\s+/).filter(Boolean));
  return tokens.some((token) => words.has(token));
}

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectSemanticHints(profile) {
  const values = (profile.sampleValues ?? []).map(String);
  if (values.length === 0) return null;
  const allMatch = (matcher) => values.every(matcher);
  const columnName = profile.columnName ?? '';
  const dateHeaderHint = hasColumnHint(columnName, ['date']);
  const timeHeaderHint = hasColumnHint(columnName, ['time']) && !dateHeaderHint;
  const jobReferenceHint = hasColumnHint(columnName, ['job', 'work', 'ticket', 'case', 'order'])
    && hasColumnHint(columnName, ['number', 'no', 'id', 'code', 'reference', 'ref']);
  const signatureHeaderHint = hasColumnHint(columnName, ['signature', 'signed', 'signoff']);
  const peopleHeaderHint = hasColumnHint(columnName, ['member', 'staff', 'employee', 'assignee', 'operator', 'worker', 'technician']);

  if (dateHeaderHint || timeHeaderHint || jobReferenceHint || signatureHeaderHint || peopleHeaderHint) {
    const type = dateHeaderHint
      ? 'DATE'
      : timeHeaderHint
        ? 'TIME'
        : jobReferenceHint
          ? 'ALPHANUMERIC_CODE'
          : 'NAME_LIKE';
    return Object.freeze({
      detector: 'semantic-hints', type, score: 89, confidence: 'LOW',
      evidence: Object.freeze([
        `The column header strongly indicated ${type}.`,
        `The bounded source formatting was not sufficient to confirm that semantic type without the header.`,
      ]),
      warnings: Object.freeze([Object.freeze({
        code: 'HEADER_SEMANTIC_HEURISTIC',
        message: 'The detected type relies on the column header and requires review.',
        details: Object.freeze({}),
      })]),
      reviewRequired: true,
      details: Object.freeze({ headerSemanticHint: true }),
    });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
  if (allMatch((value) => emailPattern.test(value))) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'EMAIL', score: 97, confidence: 'HIGH',
      evidence: Object.freeze([`All ${values.length} bounded samples matched an email-shaped value.`]),
      warnings: Object.freeze([]), reviewRequired: false, details: Object.freeze({}),
    });
  }

  const phoneHint = hasColumnHint(profile.columnName ?? '', ['phone', 'telephone', 'mobile', 'tel']);
  const phoneMatch = (value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && /^[+()\d .-]+$/.test(value) && (phoneHint || /[+() .-]/.test(value));
  };
  if (allMatch(phoneMatch)) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'PHONE_LIKE', score: 91,
      confidence: phoneHint ? 'HIGH' : 'MEDIUM',
      evidence: Object.freeze([
        `All ${values.length} bounded samples had phone-like digit counts and separators.`,
        phoneHint ? 'The column name contained a phone hint.' : 'No phone hint was present in the column name.',
      ]),
      warnings: Object.freeze([]), reviewRequired: !phoneHint, details: Object.freeze({ phoneHint }),
    });
  }

  const addressHint = hasColumnHint(profile.columnName ?? '', ['address', 'street', 'road', 'location']);
  const addressMatch = (value) => /^\d+[A-Za-z]?\s+.+\s(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr)$/i.test(value);
  if (addressHint && allMatch((value) => /\p{L}/u.test(value)) || allMatch(addressMatch)) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'ADDRESS_LIKE', score: 85,
      confidence: addressHint && allMatch(addressMatch) ? 'HIGH' : 'MEDIUM',
      evidence: Object.freeze([
        `Address evidence used ${values.length} bounded samples.`,
        addressHint ? 'The column name contained an address hint.' : 'Values matched a simple address-like shape.',
      ]),
      warnings: Object.freeze([]), reviewRequired: !addressHint, details: Object.freeze({ addressHint }),
    });
  }

  const nameHint = hasColumnHint(columnName, ['name', 'firstname', 'lastname', 'fullname', 'member', 'staff', 'employee', 'assignee', 'operator']);
  const nameMatch = (value) => /^[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3}$/u.test(value);
  const titleCaseNameMatch = (value) => /^[\p{Lu}][\p{Ll}'-]*(?:\s+[\p{Lu}][\p{Ll}'-]*){0,3}$/u.test(value);
  const genericColumn = /^column_\d+$/i.test(profile.columnName ?? '');
  const genericNameSafetyMatch = genericColumn
    && new Set(values.map((value) => value.toLocaleLowerCase())).size >= 3
    && allMatch(titleCaseNameMatch);
  const nameLikeCount = values.filter(nameMatch).length;
  const genericRepeatedNameList = genericColumn
    && (profile.uniqueCount ?? 0) >= 10
    && (profile.uniqueRatio ?? 1) <= 0.5
    && nameLikeCount / values.length >= 0.9;
  if (((nameHint || genericNameSafetyMatch) && allMatch(nameMatch)) || genericRepeatedNameList) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'NAME_LIKE', score: nameHint ? 84 : 76, confidence: nameHint ? 'MEDIUM' : 'LOW',
      evidence: Object.freeze([
        genericRepeatedNameList
          ? `${nameLikeCount} of ${values.length} bounded samples were short name-like word sequences.`
          : `All ${values.length} bounded samples were short name-like word sequences.`,
        nameHint
          ? 'The column name contained a name hint.'
          : genericRepeatedNameList
            ? 'The header was unavailable, but a repeated list of many short word-only values was handled conservatively as potentially name-like.'
            : 'The header was unavailable, so title-case values were handled conservatively as potentially name-like.',
      ]),
      warnings: Object.freeze([Object.freeze({
        code: 'SEMANTIC_NAME_HEURISTIC',
        message: 'Name-like detection is heuristic and may match labels or place names.',
        details: Object.freeze({}),
      })]),
      reviewRequired: true, details: Object.freeze({ nameHint, genericNameSafetyMatch, genericRepeatedNameList }),
    });
  }

  const averageLength = values.reduce((sum, value) => sum + value.length, 0) / values.length;
  const freeText = (profile.lengthStats?.maximum ?? 0) >= 80 || averageLength >= 60 || values.some((value) => /[.!?]\s|\n/.test(value));
  if (freeText) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'FREE_TEXT', score: 74, confidence: 'HIGH',
      evidence: Object.freeze([
        `Maximum observed length was ${profile.lengthStats?.maximum ?? 0}.`,
        `Average bounded-sample length was ${averageLength.toFixed(1)}.`,
      ]),
      warnings: Object.freeze([]), reviewRequired: false, details: Object.freeze({ averageSampleLength: averageLength }),
    });
  }

  if (values.some((value) => /\p{L}/u.test(value))) {
    return Object.freeze({
      detector: 'semantic-hints', type: 'GENERAL_TEXT', score: 20, confidence: 'MEDIUM',
      evidence: Object.freeze([`${values.length} bounded samples contained general text.`]),
      warnings: Object.freeze([]), reviewRequired: true, details: Object.freeze({}),
    });
  }
  return null;
}
