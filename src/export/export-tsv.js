import { serializeDelimited } from './serialize-delimited.js';

export function exportTsv({ headers, rows, excelSafe = true, bom = false, lineEnding = '\r\n' }) {
  const serialized = serializeDelimited({ headers, rows, delimiter: '\t', lineEnding, bom, excelSafe });
  return Object.freeze({
    ...serialized,
    extension: 'tsv',
    mimeType: 'text/tab-separated-values;charset=utf-8',
  });
}
