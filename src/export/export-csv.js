import { serializeDelimited } from './serialize-delimited.js';

export function exportCsv({ headers, rows, excelSafe = true, bom = true, lineEnding = '\r\n' }) {
  const serialized = serializeDelimited({ headers, rows, delimiter: ',', lineEnding, bom, excelSafe });
  return Object.freeze({
    ...serialized,
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
  });
}
