import { formatDateValue, parseDateValue } from './date-shift-context.js';
import { formatTemporalTime, parseTemporal } from '../temporal/temporal-value.js';

function requireInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError(`${name} must be a safe integer.`);
  return number;
}

export function shiftDateByDays(value, days, orientation = null) {
  const offset = requireInteger(days, 'days');
  const parts = parseDateValue(value, orientation);
  if (!parts) throw new RangeError('The date value cannot be parsed. Supported examples include 2026-05-13, 13/05/2026, 13 May 2026, May 13, 2026, and March 6, 2026, 09.59.');
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return formatDateValue({
    ...parts,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function shiftTimeByMinutes(value, minutes) {
  const offset = requireInteger(minutes, 'minutes');
  const parsed = parseTemporal(value);
  if (parsed?.kind !== 'TIME') {
    throw new RangeError('The time value cannot be parsed. Supported examples include 08:30, 08:30:00, and 8:30 am.');
  }
  const time = parsed.time;
  const totalSeconds = (time.hour * 3600) + (time.minute * 60) + time.second + (offset * 60);
  const normalized = ((totalSeconds % 86400) + 86400) % 86400;
  const hour = Math.floor(normalized / 3600);
  const minute = Math.floor((normalized % 3600) / 60);
  const second = normalized % 60;
  return formatTemporalTime(time, { hour, minute, second });
}

export function listNumericSegments(value) {
  return Object.freeze([...String(value ?? '').matchAll(/\d+/g)].map((match, index) => Object.freeze({
    index,
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  })));
}

function integerBigInt(value, name) {
  const text = String(value).trim();
  if (!/^[+-]?\d+$/.test(text)) throw new RangeError(`${name} must be an integer.`);
  return BigInt(text);
}

export function shiftNumericSegment(value, {
  offset,
  segmentIndex = 0,
  preserveWidth = true,
  allowWidthExpansion = false,
} = {}) {
  const source = String(value ?? '');
  if (/^-\d+$/.test(source)) {
    throw new RangeError('Negative source numbers are not supported by Number/Sequence SHIFT.');
  }
  const segments = listNumericSegments(source);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segments.length) {
    throw new RangeError('The selected numeric segment does not exist.');
  }
  const segment = segments[segmentIndex];
  const shifted = integerBigInt(segment.text, 'numeric segment') + integerBigInt(offset, 'offset');
  if (shifted < 0n) throw new RangeError('The shifted numeric segment would fall below zero.');
  let replacement = shifted.toString();
  if (replacement.length > segment.text.length && !allowWidthExpansion) {
    throw new RangeError('The shifted numeric segment exceeds the original width.');
  }
  if (preserveWidth && replacement.length < segment.text.length) replacement = replacement.padStart(segment.text.length, '0');
  return `${source.slice(0, segment.start)}${replacement}${source.slice(segment.end)}`;
}
