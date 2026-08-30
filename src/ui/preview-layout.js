const CODE_LIKE_HEADER = /(^|_)(id|code|number|no|model|file|filename|reference|ref|sku|batch|serial)(_|$)/i;
const URL_LIKE_HEADER = /(^|_)(url|uri|link|signature|image|photo)(_|$)/i;
const DATE_LIKE_HEADER = /(^|_)(date|time|timestamp|created|updated|checked)(_|$)/i;

function clamp(minimum, value, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function previewDisplayUnits(value) {
  return [...String(value ?? '')].reduce(
    (total, character) => total + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1),
    0,
  );
}

function takeUnits(value, maximum, fromEnd = false) {
  const characters = [...String(value ?? '')];
  const source = fromEnd ? characters.reverse() : characters;
  const selected = [];
  let used = 0;
  for (const character of source) {
    const units = /[^\u0000-\u00ff]/u.test(character) ? 2 : 1;
    if (used + units > maximum) break;
    selected.push(character);
    used += units;
  }
  return (fromEnd ? selected.reverse() : selected).join('');
}

function sharedPrefixLength(values) {
  const distinct = [...new Set(values.map((value) => String(value ?? '')).filter(Boolean))];
  if (distinct.length < 2) return 0;
  let length = 0;
  while (distinct.every((value) => value[length] && value[length] === distinct[0][length])) length += 1;
  return length;
}

function isStructuredValue(value) {
  const text = String(value ?? '');
  return text.length >= 6
    && !text.includes('@')
    && /\d/.test(text)
    && !/\s/.test(text)
    && /^[\p{L}\p{N}._:/?&=%+-]+$/u.test(text);
}

export function previewColumnIndexes(headers = [], rows = [], { excludedIndexes = [] } = {}) {
  const excluded = excludedIndexes instanceof Set ? excludedIndexes : new Set(excludedIndexes);
  return headers.map((_, index) => index).filter((index) => !excluded.has(index));
}

export function previewColumnLayout({ headers = [], rows = [], indexes = previewColumnIndexes(headers, rows) } = {}) {
  const sampleRows = rows.slice(0, 12);
  return Object.freeze(indexes.map((index) => {
    const header = String(headers[index] ?? '');
    const values = sampleRows.map((row) => String(row?.[index] ?? ''));
    const nonEmpty = values.filter((value) => value.trim() !== '');
    const numeric = nonEmpty.length > 0 && nonEmpty.every((value) => /^[-+]?[$£€¥]?\s*[\d,.]+%?$/u.test(value.trim()));
    const dateLike = DATE_LIKE_HEADER.test(header) || (nonEmpty.length > 0 && nonEmpty.every((value) => /\d{1,4}[-/.:\s]\d{1,2}/.test(value)));
    const longest = Math.max(previewDisplayUnits(header), 1, ...nonEmpty.map(previewDisplayUnits));
    const minimum = numeric ? 76 : dateLike ? 124 : 96;
    const maximum = numeric ? 136 : dateLike ? 176 : 224;
    const width = Math.ceil(clamp(minimum, (Math.min(longest, 34) * 7.1) + 24, maximum));
    return Object.freeze({
      index,
      width,
      characterBudget: Math.max(6, Math.floor((width - 24) / 7.1)),
      peerValues: Object.freeze(nonEmpty),
    });
  }));
}

export function previewCellModel(value, {
  header = '',
  characterBudget = 24,
  peerValues = [],
} = {}) {
  const fullValue = value === null || value === undefined ? '' : String(value);
  const budget = Math.max(4, Number.isFinite(characterBudget) ? Math.floor(characterBudget) : 24);
  if (previewDisplayUnits(fullValue) <= budget) {
    return Object.freeze({ displayValue: fullValue, fullValue, truncated: false, truncation: 'none' });
  }

  const commonPrefix = sharedPrefixLength(peerValues);
  const useMiddle = URL_LIKE_HEADER.test(header)
    || CODE_LIKE_HEADER.test(header)
    || isStructuredValue(fullValue)
    || commonPrefix >= Math.max(4, Math.floor(budget * 0.45));
  if (!useMiddle) {
    return Object.freeze({
      displayValue: takeUnits(fullValue, budget - 1) + '…',
      fullValue,
      truncated: true,
      truncation: 'end',
    });
  }

  const suffixUnits = Math.max(3, Math.min(8, Math.ceil((budget - 1) * 0.45)));
  const prefixUnits = Math.max(2, budget - suffixUnits - 1);
  return Object.freeze({
    displayValue: takeUnits(fullValue, prefixUnits) + '…' + takeUnits(fullValue, suffixUnits, true),
    fullValue,
    truncated: true,
    truncation: 'middle',
  });
}
