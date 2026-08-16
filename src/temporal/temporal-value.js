const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

const MONTH_LOOKUP = Object.freeze(Object.fromEntries(MONTH_NAMES.flatMap((name, index) => [
  [name.toLocaleLowerCase(), index + 1],
  [name.slice(0, 3).toLocaleLowerCase(), index + 1],
  ...(name === 'September' ? [['sept', index + 1]] : []),
])));

function expandDisplayYear(value) {
  const year = Number(value);
  if (String(value).length !== 2) return year;
  return year <= 69 ? 2000 + year : 1900 + year;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDate(year, month, day) {
  return year >= 1000 && year <= 9999
    && month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth(year, month);
}

function validClock(hour, minute, second, meridiem) {
  const validHour = meridiem ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23;
  return validHour && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function parseClock(value, { allowDot = true } = {}) {
  const match = String(value).match(/^(\d{1,2})([:.])(\d{2})(?:([:.])(\d{2})([.,]\d{1,9})?)?(\s*)(am|pm)?(\s*)(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) return { status: 'UNSUPPORTED' };
  const [, hourToken, separator, minuteToken, secondSeparator, secondToken, fraction = '', meridiemSpacing, meridiem = '', timezoneSpacing, timezone = ''] = match;
  const hour = Number(hourToken);
  const minute = Number(minuteToken);
  const second = Number(secondToken ?? 0);
  const offsetMatch = timezone.match(/^([+-])(\d{2}):?(\d{2})$/);
  const validOffset = !offsetMatch || (Number(offsetMatch[2]) <= 23 && Number(offsetMatch[3]) <= 59);
  if (!allowDot && separator !== ':') return { status: 'UNSUPPORTED' };
  if (!validClock(hour, minute, second, meridiem) || !validOffset) {
    return { status: 'INVALID' };
  }
  let hour24 = hour;
  if (meridiem) {
    hour24 = hour % 12;
    if (meridiem.toLocaleLowerCase() === 'pm') hour24 += 12;
  }
  return {
    status: 'PARSED',
    value: Object.freeze({
      hour: hour24,
      minute,
      second,
      hourWidth: hourToken.length,
      separator,
      secondSeparator: secondSeparator ?? separator,
      hasSeconds: secondToken !== undefined,
      fraction,
      meridiem,
      meridiemSpacing,
      timezone,
      timezoneSpacing,
    }),
  };
}

function numericFormat(orientation, separator, monthWidth, dayWidth, yearWidth) {
  if (orientation === 'YMD') return `Y${yearWidth}${separator}M${monthWidth}${separator}D${dayWidth}`;
  if (orientation === 'DMY') return `D${dayWidth}${separator}M${monthWidth}${separator}Y${yearWidth}`;
  return `M${monthWidth}${separator}D${dayWidth}${separator}Y${yearWidth}`;
}

function parseDatePrefix(text, orientation) {
  let match = text.match(/^(\d{4})([-/.])(\d{1,2})([-/.])(\d{1,2})(.*)$/);
  if (match) {
    const [, yearToken, separator, monthToken, secondSeparator, dayToken, suffix] = match;
    if (separator !== secondSeparator) return { status: 'UNSUPPORTED' };
    const year = Number(yearToken);
    const month = Number(monthToken);
    const day = Number(dayToken);
    if (!validDate(year, month, day)) return { status: 'INVALID' };
    return {
      status: 'PARSED',
      value: {
        year, month, day, orientation: 'YMD', ambiguous: false,
        twoDigitYear: false, layout: 'YMD_NUMERIC', separator,
        yearWidth: yearToken.length, monthWidth: monthToken.length, dayWidth: dayToken.length,
        format: numericFormat('YMD', separator, monthToken.length, dayToken.length, yearToken.length), suffix,
      },
    };
  }

  match = text.match(/^(\d{1,2})([-/.])(\d{1,2})([-/.])(\d{4}|\d{2})(.*)$/);
  if (match) {
    const [, firstToken, separator, secondToken, secondSeparator, yearToken, suffix] = match;
    if (separator !== secondSeparator) return { status: 'UNSUPPORTED' };
    const first = Number(firstToken);
    const second = Number(secondToken);
    const year = expandDisplayYear(yearToken);
    const dmyValid = validDate(year, second, first);
    const mdyValid = validDate(year, first, second);
    let selectedOrientation = orientation === 'DMY' || orientation === 'MDY' ? orientation : null;
    let ambiguous = false;
    if (!selectedOrientation) {
      if (dmyValid && mdyValid) {
        selectedOrientation = 'DMY';
        ambiguous = true;
      } else if (dmyValid) selectedOrientation = 'DMY';
      else if (mdyValid) selectedOrientation = 'MDY';
    }
    const selectedValid = selectedOrientation === 'DMY' ? dmyValid : selectedOrientation === 'MDY' ? mdyValid : false;
    if (!selectedValid) return { status: 'INVALID' };
    const month = selectedOrientation === 'DMY' ? second : first;
    const day = selectedOrientation === 'DMY' ? first : second;
    const monthWidth = selectedOrientation === 'DMY' ? secondToken.length : firstToken.length;
    const dayWidth = selectedOrientation === 'DMY' ? firstToken.length : secondToken.length;
    return {
      status: 'PARSED',
      value: {
        year, month, day, orientation: ambiguous ? null : selectedOrientation, ambiguous,
        selectedOrientation, twoDigitYear: yearToken.length === 2,
        layout: `${selectedOrientation}_NUMERIC`, separator,
        yearWidth: yearToken.length, monthWidth, dayWidth,
        format: numericFormat(selectedOrientation, separator, monthWidth, dayWidth, yearToken.length), suffix,
      },
    };
  }

  match = text.match(/^(\d{1,2})(\s+|[-/.])([A-Za-z]{3,9})(,?)(\s+|[-/.])(\d{4}|\d{2})(.*)$/);
  if (match) {
    const [, dayToken, separator1, monthToken, monthComma, separator2, yearToken, suffix] = match;
    const month = MONTH_LOOKUP[monthToken.toLocaleLowerCase()];
    const year = expandDisplayYear(yearToken);
    const day = Number(dayToken);
    if (!month || !validDate(year, month, day)) return { status: 'INVALID' };
    return {
      status: 'PARSED',
      value: {
        year, month, day, orientation: 'DMY', ambiguous: false,
        twoDigitYear: yearToken.length === 2, layout: 'DMY_NAME',
        yearWidth: yearToken.length, dayWidth: dayToken.length, monthToken,
        separator1, separator2, monthComma,
        format: 'DD MMM YYYY', suffix,
      },
    };
  }

  match = text.match(/^([A-Za-z]{3,9})(\s+|[-/.])(\d{1,2})(,?)(\s+|[-/.])(\d{4}|\d{2})(.*)$/);
  if (match) {
    const [, monthToken, separator1, dayToken, dayComma, separator2, yearToken, suffix] = match;
    const month = MONTH_LOOKUP[monthToken.toLocaleLowerCase()];
    const year = expandDisplayYear(yearToken);
    const day = Number(dayToken);
    if (!month || !validDate(year, month, day)) return { status: 'INVALID' };
    return {
      status: 'PARSED',
      value: {
        year, month, day, orientation: 'MDY', ambiguous: false,
        twoDigitYear: yearToken.length === 2, layout: 'MDY_NAME',
        yearWidth: yearToken.length, dayWidth: dayToken.length, monthToken,
        separator1, separator2, dayComma,
        format: 'MMM DD YYYY', suffix,
      },
    };
  }

  return { status: 'NOT_TEMPORAL' };
}

function broadTemporalShape(text) {
  return (
    /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(text)
    || /(?:\d{1,2}\s+[A-Za-z]{3,9}|[A-Za-z]{3,9}\s+\d{1,2}).*\d{2,4}/i.test(text)
    || /\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?/i.test(text)
  );
}

/**
 * Parses common local date, time, and date-time representations without using
 * the implementation-dependent Date string parser.
 *
 * @param {unknown} value
 * @param {{orientation?: 'DMY'|'MDY'|'YMD'|null}} [options]
 */
export function inspectTemporalValue(value, { orientation = null } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return Object.freeze({ status: 'NOT_TEMPORAL', temporalLike: false, parsed: null });

  const clock = parseClock(text, { allowDot: false });
  if (clock.status === 'PARSED') {
    return Object.freeze({
      status: 'PARSED', temporalLike: true,
      parsed: Object.freeze({ kind: 'TIME', format: 'TIME', orientation: null, ambiguous: false, time: clock.value }),
    });
  }
  if (clock.status === 'INVALID') {
    return Object.freeze({ status: 'INVALID', temporalLike: true, parsed: null });
  }

  const date = parseDatePrefix(text, orientation);
  if (date.status === 'INVALID') {
    return Object.freeze({ status: 'INVALID', temporalLike: true, parsed: null });
  }
  if (date.status === 'PARSED') {
    const parts = date.value;
    if (!parts.suffix) {
      return Object.freeze({ status: 'PARSED', temporalLike: true, parsed: Object.freeze({ ...parts, kind: 'DATE' }) });
    }
    const tail = parts.suffix.match(/^(T|,\s*|\s+)(.+)$/);
    if (!tail) return Object.freeze({ status: 'UNSUPPORTED', temporalLike: true, parsed: null });
    const tailClock = parseClock(tail[2]);
    if (tailClock.status !== 'PARSED') {
      return Object.freeze({ status: tailClock.status, temporalLike: true, parsed: null });
    }
    return Object.freeze({
      status: 'PARSED', temporalLike: true,
      parsed: Object.freeze({ ...parts, kind: 'DATETIME', time: tailClock.value }),
    });
  }

  return Object.freeze({
    status: broadTemporalShape(text) ? 'UNSUPPORTED' : 'NOT_TEMPORAL',
    temporalLike: broadTemporalShape(text),
    parsed: null,
  });
}

export function parseTemporal(value, options = {}) {
  return inspectTemporalValue(value, options).parsed;
}

function displayNumber(value, width) {
  return String(value).padStart(Math.max(1, width), '0');
}

function displayYear(year, width) {
  return width === 2 ? String(year % 100).padStart(2, '0') : String(year).padStart(width, '0');
}

function styledMonth(month, originalToken) {
  const full = MONTH_NAMES[month - 1];
  let display = originalToken.length > 4 ? full : full.slice(0, 3);
  if (month === 9 && originalToken.length === 4) display = 'Sept';
  if (originalToken === originalToken.toLocaleUpperCase()) return display.toLocaleUpperCase();
  if (originalToken === originalToken.toLocaleLowerCase()) return display.toLocaleLowerCase();
  return display;
}

/** Preserves the source token order, separators, padding, month style, and time suffix. */
export function formatTemporalDate(parts, { year, month, day } = parts) {
  const yearText = displayYear(year, parts.yearWidth);
  const monthText = displayNumber(month, parts.monthWidth);
  const dayText = displayNumber(day, parts.dayWidth);
  if (parts.layout === 'YMD_NUMERIC') return `${yearText}${parts.separator}${monthText}${parts.separator}${dayText}${parts.suffix ?? ''}`;
  if (parts.layout === 'DMY_NUMERIC') return `${dayText}${parts.separator}${monthText}${parts.separator}${yearText}${parts.suffix ?? ''}`;
  if (parts.layout === 'MDY_NUMERIC') return `${monthText}${parts.separator}${dayText}${parts.separator}${yearText}${parts.suffix ?? ''}`;
  const monthName = styledMonth(month, parts.monthToken);
  if (parts.layout === 'DMY_NAME') {
    return `${dayText}${parts.separator1}${monthName}${parts.monthComma ?? ''}${parts.separator2}${yearText}${parts.suffix ?? ''}`;
  }
  if (parts.layout === 'MDY_NAME') {
    return `${monthName}${parts.separator1}${dayText}${parts.dayComma ?? ''}${parts.separator2}${yearText}${parts.suffix ?? ''}`;
  }
  throw new RangeError('Unsupported temporal date layout.');
}

/** Preserves the source clock separator, precision, padding, AM/PM style, and timezone text. */
export function formatTemporalTime(time, { hour = time.hour, minute = time.minute, second = time.second } = {}) {
  let displayHour = hour;
  let meridiem = time.meridiem;
  if (time.meridiem) {
    displayHour = hour % 12 || 12;
    const next = hour < 12 ? 'am' : 'pm';
    meridiem = time.meridiem === time.meridiem.toLocaleUpperCase() ? next.toLocaleUpperCase() : next;
  }
  const base = `${displayNumber(displayHour, time.hourWidth)}${time.separator}${displayNumber(minute, 2)}`;
  const withSeconds = time.hasSeconds
    ? `${base}${time.secondSeparator}${displayNumber(second, 2)}${time.fraction}`
    : base;
  return `${withSeconds}${meridiem ? `${time.meridiemSpacing}${meridiem}` : ''}${time.timezone ? `${time.timezoneSpacing}${time.timezone}` : ''}`;
}
