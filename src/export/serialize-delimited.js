import { inspectFormulaRisks, makeExcelSafe } from './excel-safety.js';

function escapeCell(value, delimiter, excelSafe) {
  const text = excelSafe
    ? makeExcelSafe(value)
    : value === null || value === undefined ? '' : String(value);
  if (text.includes('"') || text.includes('\r') || text.includes('\n') || text.includes(delimiter)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function serializeDelimited({
  headers,
  rows,
  delimiter = ',',
  lineEnding = '\r\n',
  bom = false,
  excelSafe = false,
}) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) throw new TypeError('headers and rows must be arrays.');
  if (typeof delimiter !== 'string' || delimiter.length !== 1) throw new RangeError('delimiter must be one character.');
  if (!['\r\n', '\n'].includes(lineEnding)) throw new RangeError('lineEnding must be CRLF or LF.');
  const allRows = [headers, ...rows];
  const content = allRows
    .map((row) => row.map((value) => escapeCell(value, delimiter, excelSafe)).join(delimiter))
    .join(lineEnding);
  return Object.freeze({
    content: `${bom ? '\uFEFF' : ''}${content}${lineEnding}`,
    formulaRisks: inspectFormulaRisks(rows, { headers }),
    excelSafe,
    delimiter,
    lineEnding,
    bom,
  });
}
