import { formatTemporalDate, formatTemporalTime, parseTemporal } from '../temporal/temporal-value.js';

const DATE_ORIENTATIONS = new Set(['DMY', 'MDY', 'YMD']);

export function resolveDateOrientation({ actionParams = {}, detection = null } = {}) {
  const configured = actionParams?.dateOrientation;
  if (DATE_ORIENTATIONS.has(configured)) return configured;
  const detected = detection?.details?.orientations?.[0];
  return DATE_ORIENTATIONS.has(detected) ? detected : null;
}

export function parseDateValue(value, orientation = null) {
  const parsed = parseTemporal(value, { orientation });
  return parsed && ['DATE', 'DATETIME'].includes(parsed.kind) ? parsed : null;
}

export function formatDateValue(parts) {
  return formatTemporalDate(parts, parts);
}

export function dateSerial(value, orientation = null) {
  const parts = parseDateValue(value, orientation);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
}

function shiftedClock(time, offsetMinutes) {
  const sourceSeconds = (time.hour * 3600) + (time.minute * 60) + time.second;
  const normalized = ((sourceSeconds + (offsetMinutes * 60)) % 86400 + 86400) % 86400;
  return {
    hour: Math.floor(normalized / 3600),
    minute: Math.floor((normalized % 3600) / 60),
    second: normalized % 60,
  };
}

export class DateShiftContext {
  constructor({ random, minimumDays = -730, maximumDays = 730 } = {}) {
    if (!random) throw new TypeError('random is required.');
    this.random = random;
    this.minimumDays = minimumDays;
    this.maximumDays = maximumDays;
    this.offsets = new Map();
    this.timeOffsets = new Map();
  }

  offsetFor(scope) {
    const key = String(scope || 'default');
    if (this.offsets.has(key)) return this.offsets.get(key);
    let offset = 0;
    for (let attempt = 0; attempt < 8 && offset === 0; attempt += 1) {
      offset = this.random.integer(this.minimumDays, this.maximumDays);
    }
    if (offset === 0) offset = this.maximumDays >= 1 ? 1 : -1;
    this.offsets.set(key, offset);
    return offset;
  }

  configuredOffsetFor(scope, minimum, maximum) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) {
      throw new RangeError('Configured SHIFT range must use safe integers with minimum not exceeding maximum.');
    }
    const key = `configured:${String(scope || 'default')}:${minimum}:${maximum}`;
    if (!this.offsets.has(key)) {
      let offset = 0;
      for (let attempt = 0; attempt < 8 && offset === 0; attempt += 1) offset = this.random.integer(minimum, maximum);
      if (offset === 0) offset = minimum !== 0 ? minimum : maximum;
      if (offset === 0) throw new RangeError('Configured SHIFT range must contain a non-zero offset.');
      this.offsets.set(key, offset);
    }
    return this.offsets.get(key);
  }

  shift(value, { scope = 'default', orientation = null, preserveIntervals = true } = {}) {
    const parts = parseDateValue(value, orientation);
    if (!parts) return null;
    const offsetScope = preserveIntervals ? scope : `${scope}:${String(value)}`;
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    shifted.setUTCDate(shifted.getUTCDate() + this.offsetFor(offsetScope));
    return formatTemporalDate(parts, {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    });
  }

  shiftTime(value, { scope = 'default', preserveIntervals = true } = {}) {
    const parsed = parseTemporal(value);
    if (parsed?.kind !== 'TIME') return null;
    const offsetScope = preserveIntervals ? String(scope) : `${scope}:${String(value)}`;
    if (!this.timeOffsets.has(offsetScope)) {
      let offset = this.random.integer(-360, 360);
      if (offset === 0) offset = 60;
      this.timeOffsets.set(offsetScope, offset);
    }
    return formatTemporalTime(parsed.time, shiftedClock(parsed.time, this.timeOffsets.get(offsetScope)));
  }

  statistics() {
    return Object.freeze({ offsetScopeCount: this.offsets.size, timeOffsetScopeCount: this.timeOffsets.size });
  }
}
