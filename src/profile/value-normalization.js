/** @param {string} value @param {number} [seed] */
export function stableHash32(value, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** @param {string} value */
export function stableFingerprint(value) {
  const first = stableHash32(value).toString(16).padStart(8, '0');
  const second = stableHash32(value, 0x9e3779b9).toString(16).padStart(8, '0');
  return `${first}${second}`;
}

/** @param {string} value @param {number} maxLength */
export function truncateForTracking(value, maxLength) {
  if (!Number.isInteger(maxLength) || maxLength < 24) {
    throw new RangeError('maxLength must be an integer of at least 24.');
  }
  if (value.length <= maxLength) {
    return Object.freeze({ value, truncated: false, fingerprint: null });
  }
  const fingerprint = stableFingerprint(value);
  const prefixLength = maxLength - fingerprint.length - 2;
  return Object.freeze({
    value: `${value.slice(0, prefixLength)}…#${fingerprint}`,
    truncated: true,
    fingerprint,
  });
}

/** @param {string} text */
export function classifyCasePattern(text) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 'NO_CASE';
  if (text === text.toLocaleUpperCase() && text !== text.toLocaleLowerCase()) return 'UPPER';
  if (text === text.toLocaleLowerCase() && text !== text.toLocaleUpperCase()) return 'LOWER';
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  const isTitle = words.length > 0 && words.every(
    (word) => word[0] === word[0].toLocaleUpperCase() && word.slice(1) === word.slice(1).toLocaleLowerCase(),
  );
  return isTitle ? 'TITLE' : 'MIXED';
}

/**
 * Parses numeric-looking text without performing general type inference.
 * Percentage values retain their displayed scale: `12.5%` becomes 12.5.
 *
 * @param {string} text
 */
export function parseNumericToken(text) {
  let candidate = text.trim();
  let kind = null;
  let currencyMarker = null;

  if (candidate.endsWith('%')) {
    kind = 'PERCENTAGE';
    candidate = candidate.slice(0, -1).trim();
  }

  const leadingCurrency = candidate.match(/^([\p{Sc}]|[A-Z]{3})\s*/u);
  const trailingCurrency = candidate.match(/\s*([\p{Sc}]|[A-Z]{3})$/u);
  if (leadingCurrency) {
    currencyMarker = leadingCurrency[1];
    candidate = candidate.slice(leadingCurrency[0].length);
  } else if (trailingCurrency) {
    currencyMarker = trailingCurrency[1];
    candidate = candidate.slice(0, -trailingCurrency[0].length);
  }
  if (currencyMarker) kind = 'CURRENCY_LIKE';

  const numericPattern = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/;
  if (!numericPattern.test(candidate)) return null;
  const canonical = candidate.replaceAll(',', '');
  const number = Number(canonical);
  if (!Number.isFinite(number)) return null;
  const decimalPart = canonical.match(/\.(\d+)$/)?.[1] ?? '';
  const unsignedDigits = canonical.replace(/^[+-]/, '').replace('.', '');
  const inferredKind = kind ?? (decimalPart.length > 0 ? 'DECIMAL' : 'INTEGER');

  return Object.freeze({
    value: number,
    kind: inferredKind,
    decimalPlaces: decimalPart.length,
    currencyMarker,
    digitCount: unsignedDigits.length,
    hasLeadingZero: /^[-+]?0\d/.test(canonical),
    canonical,
  });
}

/** @param {unknown} value @param {Object} [options] @param {boolean} [options.trim] */
export function normalizeValue(value, { trim = true } = {}) {
  if (value === null || value === undefined) {
    return Object.freeze({
      text: '',
      isEmpty: true,
      wasNullish: true,
      length: 0,
      casePattern: 'NO_CASE',
      numeric: null,
    });
  }
  const rawText = String(value);
  const text = trim ? rawText.trim() : rawText;
  const isEmpty = text.length === 0;
  return Object.freeze({
    text,
    isEmpty,
    wasNullish: false,
    length: text.length,
    casePattern: isEmpty ? 'NO_CASE' : classifyCasePattern(text),
    numeric: isEmpty ? null : parseNumericToken(text),
  });
}
