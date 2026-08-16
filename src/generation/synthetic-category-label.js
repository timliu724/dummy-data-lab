function readableColumnLabel(columnName) {
  const words = String(columnName ?? '')
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return 'Category';
  return words
    .map((word) => `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ')
    .slice(0, 48)
    .trim() || 'Category';
}

export function syntheticColumnValueLabel({ columnName = '', suffix } = {}) {
  const safeSuffix = String(suffix ?? '').replace(/[^\p{L}\p{N}-]+/gu, '').slice(0, 24);
  if (!safeSuffix) throw new TypeError('suffix must contain a visible letter or number.');
  return `Synthetic ${readableColumnLabel(columnName)} ${safeSuffix}`;
}

export function syntheticCategoryLabel({ columnName = '', ordinal, group = false } = {}) {
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new RangeError('ordinal must be a positive integer.');
  const label = readableColumnLabel(columnName);
  return `Synthetic ${label}${group ? ' Group' : ''} ${ordinal}`;
}
