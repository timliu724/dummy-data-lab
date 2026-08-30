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

function semanticCategoryLabel(columnName, { group = false } = {}) {
  const normalised = String(columnName ?? '')
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1_$2')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  if (/(^|_)(created_by|updated_by|modified_by|entered_by|submitted_by|assigned_to|assignee|record_owner)(_|$)/u.test(normalised)) {
    return 'Account';
  }
  if (/(^|_)product_category(_|$)/u.test(normalised)) return 'Category';
  if (/(^|_)detail_type(_|$)/u.test(normalised)) return 'Type';
  if (/(^|_)service_type(_|$)/u.test(normalised)) return 'Service option';
  if (/(^|_)(description|comment|notes?|remark)(_|$)/u.test(normalised)) return 'Description';
  if (/(^|_)(id|no|number|code|reference|ref)(_|$)/u.test(normalised)) return 'Reference';
  if (/(^|_)(country|state|province|territory|region)(_|$)/u.test(normalised)) return 'Region';
  const label = readableColumnLabel(columnName);
  return group ? `${label} group` : label;
}

function alphabeticOrdinal(ordinal) {
  let value = ordinal;
  let output = '';
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

export function syntheticColumnValueLabel({ columnName = '', suffix } = {}) {
  const safeSuffix = String(suffix ?? '').replace(/[^\p{L}\p{N}-]+/gu, '').slice(0, 24);
  if (!safeSuffix) throw new TypeError('suffix must contain a visible letter or number.');
  return `${readableColumnLabel(columnName)} ${safeSuffix}`;
}

export function syntheticCategoryLabel({ columnName = '', ordinal, group = false } = {}) {
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new RangeError('ordinal must be a positive integer.');
  const label = semanticCategoryLabel(columnName, { group });
  return `${label} ${alphabeticOrdinal(ordinal)}`;
}
