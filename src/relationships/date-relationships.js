import { dateSerial, formatDateValue, parseDateValue } from '../generation/date-shift-context.js';

export function addDays(value, days) {
  const parts = parseDateValue(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateValue({
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function applyDateOrder({ row, headers, rule }) {
  const [earlierColumn, laterColumn] = rule.columnNames;
  const earlierIndex = headers.indexOf(earlierColumn);
  const laterIndex = headers.indexOf(laterColumn);
  if (earlierIndex < 0 || laterIndex < 0) return { row, repaired: false };
  const earlier = dateSerial(row[earlierIndex]);
  const later = dateSerial(row[laterIndex]);
  if (earlier === null || later === null || later >= earlier) return { row, repaired: false };
  const updated = [...row];
  updated[laterIndex] = addDays(updated[earlierIndex], 1);
  return { row: updated, repaired: true };
}

export function dateOrderIsValid({ row, headers, rule }) {
  return evaluateDateOrder({ row, headers, rule }).status !== 'VIOLATION';
}

export function evaluateDateOrder({ row, headers, rule, orientationForColumn = () => null }) {
  const [earlierColumn, laterColumn] = rule.columnNames;
  const earlierIndex = headers.indexOf(earlierColumn);
  const laterIndex = headers.indexOf(laterColumn);
  if (earlierIndex < 0 || laterIndex < 0) {
    return Object.freeze({ status: 'NOT_EVALUATED', reason: 'MISSING_COLUMN' });
  }
  const earlierValue = row[earlierIndex];
  const laterValue = row[laterIndex];
  if (String(earlierValue ?? '').trim() === '' || String(laterValue ?? '').trim() === '') {
    return Object.freeze({ status: 'NOT_EVALUATED', reason: 'EMPTY_VALUE' });
  }
  const earlier = dateSerial(earlierValue, orientationForColumn(earlierColumn));
  const later = dateSerial(laterValue, orientationForColumn(laterColumn));
  if (earlier === null || later === null) {
    return Object.freeze({ status: 'NOT_EVALUATED', reason: 'UNPARSEABLE_VALUE' });
  }
  return Object.freeze({ status: earlier <= later ? 'VALID' : 'VIOLATION', reason: null });
}
