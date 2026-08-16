import Papa from './papa-provider.js';

export const STANDARD_DELIMITERS = Object.freeze(['\t', ',', ';', '|']);

/** @param {string} delimiter */
export function validateDelimiter(delimiter) {
  if (typeof delimiter !== 'string' || [...delimiter].length !== 1) {
    throw new RangeError('A delimiter must be exactly one character.');
  }
  if (Papa.BAD_DELIMITERS.includes(delimiter)) {
    throw new RangeError('The selected character cannot be used as a delimiter.');
  }
  return delimiter;
}

/** @param {number[]} values */
function mode(values) {
  const frequencies = new Map();
  let bestValue = 0;
  let bestCount = 0;
  for (const value of values) {
    const count = (frequencies.get(value) ?? 0) + 1;
    frequencies.set(value, count);
    if (count > bestCount || (count === bestCount && value > bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  }
  return { value: bestValue, count: bestCount };
}

/** @param {string} delimiter */
function displayDelimiter(delimiter) {
  return delimiter === '\t' ? 'Tab' : delimiter;
}

/** @param {string} sampleText @param {string} delimiter @param {number} maxRows */
function analyseCandidate(sampleText, delimiter, maxRows) {
  const parsed = Papa.parse(sampleText, {
    delimiter,
    preview: maxRows,
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  const rows = parsed.data.filter(
    (row) => !(row.length === 1 && row[0] === ''),
  );
  const columnCounts = rows.map((row) => row.length);
  const modal = mode(columnCounts);
  const stability = columnCounts.length === 0 ? 0 : modal.count / columnCounts.length;
  const rowCoverage = Math.min(columnCounts.length / Math.min(maxRows, 5), 1);
  const columnBreadth = modal.value > 1 ? Math.min((modal.value - 1) / 5, 1) : 0;
  const errorPenalty = Math.min(parsed.errors.length * 0.1, 0.4);
  const score = modal.value > 1
    ? stability * 0.7 + rowCoverage * 0.15 + columnBreadth * 0.15 - errorPenalty
    : stability * 0.08 - errorPenalty;
  const confidence = modal.value <= 1
    ? 'LOW'
    : stability >= 0.9 && columnCounts.length >= 2
      ? 'HIGH'
      : stability >= 0.7
        ? 'MEDIUM'
        : 'LOW';
  const warnings = parsed.errors.map((error) => Object.freeze({
    code: `CANDIDATE_${error.code ?? 'PARSE_ERROR'}`,
    message: error.message,
  }));

  return Object.freeze({
    delimiter,
    label: displayDelimiter(delimiter),
    score: Math.max(0, Number(score.toFixed(4))),
    confidence,
    sampledRowCount: columnCounts.length,
    linebreak: parsed.meta.linebreak ?? null,
    modalColumnCount: modal.value,
    columnCountStability: Number(stability.toFixed(4)),
    columnCounts: Object.freeze(columnCounts),
    evidence: Object.freeze([
      `${modal.count} of ${columnCounts.length} sampled logical rows had ${modal.value} columns.`,
      `Column-count stability was ${(stability * 100).toFixed(1)}%.`,
      'Quoted delimiters and embedded quoted newlines were parsed before scoring.',
    ]),
    warnings: Object.freeze(warnings),
  });
}

/**
 * @param {string} sampleText
 * @param {Object} [options]
 * @param {string} [options.customDelimiter] Adds a candidate without forcing it.
 * @param {string} [options.manualDelimiter] Forces a user-selected delimiter.
 * @param {number} [options.maxRows]
 */
export function detectDelimiter(
  sampleText,
  { customDelimiter, manualDelimiter, maxRows = 25 } = {},
) {
  if (typeof sampleText !== 'string') throw new TypeError('sampleText must be a string.');
  if (!Number.isInteger(maxRows) || maxRows < 2) {
    throw new RangeError('maxRows must be an integer of at least 2.');
  }

  if (manualDelimiter !== undefined) validateDelimiter(manualDelimiter);
  if (customDelimiter !== undefined) validateDelimiter(customDelimiter);

  const candidates = [...STANDARD_DELIMITERS];
  if (customDelimiter && !candidates.includes(customDelimiter)) candidates.push(customDelimiter);
  if (manualDelimiter && !candidates.includes(manualDelimiter)) candidates.push(manualDelimiter);

  const analysed = candidates
    .map((delimiter) => analyseCandidate(sampleText, delimiter, maxRows))
    .sort((left, right) => right.score - left.score);

  if (manualDelimiter) {
    const selected = analysed.find((candidate) => candidate.delimiter === manualDelimiter);
    return Object.freeze({
      delimiter: manualDelimiter,
      linebreak: selected.linebreak,
      confidence: 'HIGH',
      overridden: true,
      candidates: Object.freeze(analysed),
      evidence: Object.freeze([
        `The user manually selected ${displayDelimiter(manualDelimiter)}.`,
        ...selected.evidence,
      ]),
      warnings: Object.freeze(selected.warnings),
    });
  }

  const selected = analysed[0];
  const runnerUp = analysed[1];
  const margin = selected.score - runnerUp.score;
  let confidence = selected.confidence;
  if (selected.modalColumnCount <= 1 || margin < 0.08) confidence = 'LOW';
  else if (confidence === 'HIGH' && margin < 0.2) confidence = 'MEDIUM';

  const warnings = [...selected.warnings];
  if (confidence === 'LOW') {
    warnings.push(Object.freeze({
      code: 'DELIMITER_AMBIGUOUS',
      message: 'Delimiter detection is uncertain; the user should review or override it.',
    }));
  }

  return Object.freeze({
    delimiter: selected.delimiter,
    linebreak: selected.linebreak,
    confidence,
    overridden: false,
    candidates: Object.freeze(analysed),
    evidence: Object.freeze([
      ...selected.evidence,
      `The score margin over the next candidate was ${margin.toFixed(4)}.`,
    ]),
    warnings: Object.freeze(warnings),
  });
}
