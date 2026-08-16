const SAFE_SEPARATOR = /^[\s,;|/]+$/u;
const SEPARATOR_SPLIT = /([\s,;|/]+)/gu;
const MAX_ITEMS_PER_CELL = 32;

function valueShape(value) {
  return [...String(value ?? '')].map((character) => {
    if (/\p{Lu}/u.test(character)) return 'A';
    if (/\p{Ll}/u.test(character)) return 'a';
    if (/\p{L}/u.test(character)) return 'L';
    if (/\p{N}/u.test(character)) return '9';
    if (/\s/u.test(character)) return '_';
    return character;
  }).join('');
}

function separatorKind(value) {
  const compact = String(value).replaceAll(/\s/gu, '');
  if (compact === '') return 'WHITESPACE';
  const kinds = new Set([...compact].map((character) => ({
    ',': 'COMMA', ';': 'SEMICOLON', '|': 'PIPE', '/': 'SLASH',
  })[character] ?? 'OTHER'));
  return kinds.size === 1 ? [...kinds][0] : 'MIXED';
}

function structuralGroup(value, direction) {
  const text = String(value ?? '');
  const letterMatch = direction === 'prefix'
    ? text.match(/^([A-Za-z]{2,4})(?=[^A-Za-z]|$)/u)
    : text.match(/(?:^|[^A-Za-z])([A-Za-z]{2,4})$/u);
  if (letterMatch) return direction === 'prefix' ? letterMatch[1] : letterMatch[1];
  if (/^\d{4,}$/u.test(text)) return direction === 'prefix' ? text.slice(0, 2) : null;
  const mixedDigits = direction === 'prefix'
    ? text.match(/^(\d{2,4})(?=[A-Za-z.\/_-])/u)
    : text.match(/(?:[A-Za-z.\/_-])(\d{2,4})$/u);
  return mixedDigits?.[1] ?? null;
}

function rankedGroups(items, direction) {
  const counts = new Map();
  for (const item of items) {
    const group = structuralGroup(item.value, direction);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => Object.freeze({ value, count, coverage: items.length === 0 ? 0 : count / items.length }))
    .filter((entry) => entry.count >= 2 || entry.coverage >= 0.5)
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, 8);
}

/**
 * Splits a bounded cell into alternating item/separator parts. Separators are
 * punctuation/whitespace only and may therefore be retained without keeping
 * an identifier fragment.
 */
export function tokenizeMultiValueCell(value, { maxItems = MAX_ITEMS_PER_CELL } = {}) {
  const text = String(value ?? '');
  const parts = text.split(SEPARATOR_SPLIT).filter((part) => part !== '').map((part) => {
    if (SAFE_SEPARATOR.test(part)) {
      return Object.freeze({ kind: 'SEPARATOR', value: part, separatorKind: separatorKind(part) });
    }
    return Object.freeze({ kind: 'ITEM', value: part, shape: valueShape(part) });
  });
  const items = parts.filter((part) => part.kind === 'ITEM');
  if (items.length === 0 || items.length > maxItems) {
    return Object.freeze({ valid: false, parts: Object.freeze(parts), items: Object.freeze(items), itemCount: items.length });
  }
  return Object.freeze({
    valid: true,
    parts: Object.freeze(parts),
    items: Object.freeze(items),
    itemCount: items.length,
    separatorKinds: Object.freeze([...new Set(parts.filter((part) => part.kind === 'SEPARATOR').map((part) => part.separatorKind))]),
  });
}

/** Uses only the profiler's bounded sample values and emits shape/glue evidence. */
export function analyseMultiValuePattern(values, { maxSamples = 128 } = {}) {
  const samples = [...new Set((values ?? []).map(String).filter((value) => value !== ''))].slice(0, maxSamples);
  const tokenized = samples.map((value) => tokenizeMultiValueCell(value)).filter((entry) => entry.valid);
  const shapeCounts = new Map();
  for (const entry of tokenized) {
    for (const item of entry.items) shapeCounts.set(item.shape, (shapeCounts.get(item.shape) ?? 0) + 1);
  }
  const rankedShapes = [...shapeCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const itemShape = rankedShapes[0]?.[0] ?? null;
  const totalItemCount = tokenized.reduce((sum, entry) => sum + entry.itemCount, 0);
  const matchingItemCount = itemShape === null ? 0 : (shapeCounts.get(itemShape) ?? 0);
  const matchingEntries = itemShape === null ? [] : tokenized.filter((entry) => entry.items.every((item) => item.shape === itemShape));
  const multiValueEntries = matchingEntries.filter((entry) => entry.itemCount >= 2);
  const matchingItems = matchingEntries.flatMap((entry) => entry.items);
  const sampleCoverage = samples.length === 0 ? 0 : matchingEntries.length / samples.length;
  const itemCoverage = totalItemCount === 0 ? 0 : matchingItemCount / totalItemCount;
  const confidence = multiValueEntries.length >= 2 && sampleCoverage >= 0.75 && itemCoverage >= 0.9
    ? 'HIGH'
    : multiValueEntries.length >= 1 && sampleCoverage >= 0.6 && itemCoverage >= 0.75
      ? 'MEDIUM'
      : 'LOW';
  const separatorKinds = [...new Set(multiValueEntries.flatMap((entry) => entry.separatorKinds))].sort();

  return Object.freeze({
    detected: multiValueEntries.length > 0,
    autoEnabled: confidence === 'HIGH',
    confidence,
    itemShape,
    sampleSize: samples.length,
    matchingSampleCount: matchingEntries.length,
    multiValueSampleCount: multiValueEntries.length,
    sampleCoverage,
    itemCoverage,
    maximumItemCount: multiValueEntries.reduce((maximum, entry) => Math.max(maximum, entry.itemCount), 1),
    separatorKinds: Object.freeze(separatorKinds),
    itemPrefixGroups: Object.freeze(rankedGroups(matchingItems, 'prefix')),
    itemSuffixGroups: Object.freeze(rankedGroups(matchingItems, 'suffix')),
    preservesOriginalSeparators: true,
  });
}

export function activeMultiValueTokenization(value, params = {}) {
  const mode = String(params.multiValueMode ?? 'AUTO').toUpperCase();
  if (mode === 'OFF') return null;
  if (mode === 'AUTO' && params.multiValueDetected !== true) return null;
  const tokenized = tokenizeMultiValueCell(value);
  if (!tokenized.valid) return null;
  if (mode === 'AUTO') {
    const expectedShape = String(params.multiValueItemShape ?? '');
    if (!expectedShape || !tokenized.items.every((item) => item.shape === expectedShape)) return null;
  }
  return tokenized;
}

export const MULTI_VALUE_SEPARATOR_KINDS = Object.freeze(['WHITESPACE', 'COMMA', 'SEMICOLON', 'PIPE', 'SLASH', 'MIXED']);
