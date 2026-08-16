import { parseTemporalValue } from '../detection/date-time.js';
import { parseNumericToken } from '../profile/value-normalization.js';
import { syntheticCategoryLabel } from './synthetic-category-label.js';

export const GENERALISATION_STRATEGIES = Object.freeze({
  AUTO: 'AUTO',
  AGE_BAND: 'AGE_BAND',
  POSTCODE_PREFIX: 'POSTCODE_PREFIX',
  DATE_PRECISION: 'DATE_PRECISION',
  NUMERIC_BAND: 'NUMERIC_BAND',
  CATEGORY_GROUP: 'CATEGORY_GROUP',
  TEXT_LENGTH_BAND: 'TEXT_LENGTH_BAND',
});

export const GENERALISATION_STRATEGY_VALUES = Object.freeze(Object.values(GENERALISATION_STRATEGIES));
export const GENERALISATION_LEVEL_VALUES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

function resolvedStrategy({ strategy, detectedType, columnName }) {
  if (strategy && strategy !== 'AUTO') return strategy;
  if (/\bage\b/i.test(columnName)) return 'AGE_BAND';
  if (/post\s*code|postal|\bzip\b/i.test(columnName)) return 'POSTCODE_PREFIX';
  if (['DATE', 'AMBIGUOUS_DATE', 'DATETIME', 'TIME'].includes(detectedType)) return 'DATE_PRECISION';
  if (['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE'].includes(detectedType)) return 'NUMERIC_BAND';
  if (detectedType === 'CATEGORY') return 'CATEGORY_GROUP';
  if (detectedType === 'ADDRESS_LIKE' || /address|street|suburb|city/i.test(columnName)) return 'CATEGORY_GROUP';
  return 'TEXT_LENGTH_BAND';
}

function numericBand(value, level) {
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(value) || 1)) - 2);
  const width = magnitude * ({ LOW: 1, MEDIUM: 5, HIGH: 10 }[level] ?? 5);
  const lower = Math.floor(value / width) * width;
  return `${lower}-${lower + width - magnitude}`;
}

function formatDatePrecision(text, detectedType, level) {
  const temporal = parseTemporalValue(text);
  if (!temporal) return detectedType === 'DATETIME' ? '2000-01-01 00:00:00' : detectedType === 'TIME' ? '00:00:00' : '2000-01-01';
  if (detectedType === 'TIME') {
    const hour = temporal.time?.hour ?? 0;
    const generalizedHour = level === 'HIGH' ? Math.floor(hour / 8) * 8 : hour;
    const minute = level === 'LOW' ? temporal.time?.minute ?? 0 : 0;
    return `${String(generalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  }
  const year = temporal.year ?? 2000;
  const outputYear = level === 'HIGH' ? Math.floor(year / 10) * 10 : year;
  const month = level === 'LOW' ? temporal.month ?? 1 : 1;
  const date = `${String(outputYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  return detectedType === 'DATETIME' ? `${date} 00:00:00` : date;
}

function categoryGroup(text, level, columnName) {
  const groupCount = { LOW: 20, MEDIUM: 10, HIGH: 5 }[level] ?? 10;
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return syntheticCategoryLabel({
    columnName,
    ordinal: (hash >>> 0) % groupCount + 1,
    group: true,
  });
}

export function generaliseValue(value, {
  detectedType = 'UNKNOWN',
  columnName = '',
  strategy = 'AUTO',
  level = 'MEDIUM',
} = {}) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  const selected = resolvedStrategy({ strategy, detectedType, columnName });
  const safeLevel = GENERALISATION_LEVEL_VALUES.includes(level) ? level : 'MEDIUM';
  const numeric = parseNumericToken(text);

  if (selected === 'AGE_BAND' && numeric) {
    const width = { LOW: 5, MEDIUM: 10, HIGH: 20 }[safeLevel];
    const lower = Math.floor(numeric.value / width) * width;
    return `${lower}-${lower + width - 1}`;
  }
  if (selected === 'POSTCODE_PREFIX') {
    const prefixLength = { LOW: 3, MEDIUM: 2, HIGH: 1 }[safeLevel];
    const compact = text.replace(/\s+/g, '');
    return `${compact.slice(0, prefixLength)}${'*'.repeat(Math.max(1, compact.length - prefixLength))}`;
  }
  if (selected === 'DATE_PRECISION') return formatDatePrecision(text, detectedType, safeLevel);
  if (selected === 'NUMERIC_BAND' && numeric) {
    const band = numericBand(numeric.value, safeLevel);
    if (detectedType === 'PERCENTAGE') return `${band}%`;
    if (detectedType === 'CURRENCY_LIKE') return `${numeric.currencyMarker ?? '$'}${band}`;
    return band;
  }
  if (selected === 'CATEGORY_GROUP') return categoryGroup(text, safeLevel, columnName);
  const width = { LOW: 10, MEDIUM: 20, HIGH: 50 }[safeLevel];
  const lower = Math.floor(Math.max(1, text.length - 1) / width) * width + 1;
  return `Text length ${lower}-${lower + width - 1}`;
}

export function generalisationDescription({ strategy = 'AUTO', level = 'MEDIUM', detectedType = 'UNKNOWN', columnName = '' } = {}) {
  const selected = resolvedStrategy({ strategy, detectedType, columnName });
  const details = {
    AGE_BAND: `Age bands of ${{ LOW: 5, MEDIUM: 10, HIGH: 20 }[level] ?? 10} years`,
    POSTCODE_PREFIX: `Keep ${{ LOW: 3, MEDIUM: 2, HIGH: 1 }[level] ?? 2} postcode character${level === 'HIGH' ? '' : 's'} and mask the rest`,
    DATE_PRECISION: level === 'LOW' ? 'Reduce dates to month precision' : level === 'HIGH' ? 'Reduce dates to decade precision' : 'Reduce dates to year precision',
    NUMERIC_BAND: `${level.toLocaleLowerCase()}-width numeric bands`,
    CATEGORY_GROUP: `Map to ${{ LOW: 20, MEDIUM: 10, HIGH: 5 }[level] ?? 10} stable groups`,
    TEXT_LENGTH_BAND: `Replace content with ${{ LOW: 10, MEDIUM: 20, HIGH: 50 }[level] ?? 20}-character length bands`,
  };
  return `${details[selected]}.`;
}
