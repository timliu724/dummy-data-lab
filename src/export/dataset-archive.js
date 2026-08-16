import { exportCsv } from './export-csv.js';
import { createStoreZip } from './zip-store.js';
import { createGenerationConfig, serializeGenerationConfig } from '../config/generation-config.js';

function safeFileStem(name, occupied) {
  const base = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table';
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) { candidate = `${base}-${suffix}`; suffix += 1; }
  occupied.add(candidate);
  return candidate;
}

function archiveFilename(date) {
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value) => String(value).padStart(2, '0')).join('-');
  return `dummy-data-project-${stamp}.zip`;
}

export function prepareDatasetArchive({
  tables,
  datasetResult,
  appVersion,
  projectConfig = null,
  excelSafe = true,
  date = new Date(),
}) {
  if (!Array.isArray(datasetResult?.tableResults) || datasetResult.tableResults.length === 0) {
    throw new RangeError('Generate the project tables before ZIP export.');
  }
  const occupied = new Set();
  const resultById = new Map(datasetResult.tableResults.map((table) => [table.id, table]));
  const tableFiles = tables.map((table) => {
    const result = resultById.get(table.id);
    if (!result) throw new RangeError(`${table.name}: generated output is missing.`);
    const filename = `${safeFileStem(table.name, occupied)}.csv`;
    const exported = exportCsv({
      headers: result.generationResult.headers,
      rows: result.generationResult.rows,
      excelSafe,
    });
    return Object.freeze({
      name: filename,
      content: exported.content,
      formulaRisks: exported.formulaRisks,
      rowCount: result.generationResult.rows.length,
      columnCount: result.generationResult.headers.length,
      tableId: table.id,
      tableName: table.name,
    });
  });
  const manifest = {
    format: 'dummy-data-project', schemaVersion: 1, appVersion, createdAt: date.toISOString(),
    validation: datasetResult.validation,
    tables: tableFiles.map(({ tableId, name, rowCount, columnCount }) => ({ tableId, file: name, rowCount, columnCount })),
  };
  const config = projectConfig ?? createGenerationConfig({
    appVersion,
    workflowKind: 'SCRATCH',
    requestedRowCount: 200,
    mode: 'SAFE_TEST_DATA',
    scratchStructure: 'MULTI',
    datasetTables: tables,
    activeDatasetTableId: tables[0]?.id ?? null,
    datasetTableSequence: tables.length,
    generatedColumns: tables[0]?.columns ?? [],
  });
  if (config.workflowKind !== 'SCRATCH' || config.scratch?.structure !== 'MULTI') {
    throw new RangeError('Project ZIP requires a related-table configuration.');
  }
  const configuredTableIds = config.scratch.tables.map((table) => table.id);
  if (configuredTableIds.length !== tables.length || tables.some((table, index) => table.id !== configuredTableIds[index])) {
    throw new RangeError('Project configuration does not match the generated tables.');
  }
  const readme = [
    'Dummy Data Lab — related-table export', '',
    'All CSV files in this package were generated locally.',
    'manifest.json lists files, row counts, and integrity results.',
    'project-config.json stores field and relationship definitions only; it contains no imported source rows.',
    '', `Generated with ${appVersion}.`,
  ].join('\r\n');
  const files = [
    ...tableFiles.map(({ name, content }) => ({ name, content })),
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'project-config.json', content: serializeGenerationConfig(config) },
    { name: 'README.txt', content: readme },
  ];
  return Object.freeze({
    content: createStoreZip(files, { date }),
    mimeType: 'application/zip',
    filename: archiveFilename(date),
    files: Object.freeze(files.map((file) => file.name)),
    formulaRisks: Object.freeze(tableFiles.flatMap((table) => table.formulaRisks.map((risk) => Object.freeze({
      ...risk,
      tableId: table.tableId,
      tableName: table.tableName,
    })))),
  });
}

export function downloadDatasetArchive(prepared, {
  documentRef = globalThis.document, urlRef = globalThis.URL, setTimeoutRef = globalThis.setTimeout,
} = {}) {
  if (!documentRef?.createElement || typeof urlRef?.createObjectURL !== 'function') throw new Error('Browser ZIP download APIs are unavailable.');
  const blob = new Blob([prepared.content], { type: prepared.mimeType });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl; anchor.download = prepared.filename; anchor.hidden = true;
  documentRef.body.append(anchor); anchor.click();
  setTimeoutRef(() => { anchor.remove(); urlRef.revokeObjectURL(objectUrl); }, 1000);
  return Object.freeze({ filename: prepared.filename, sizeBytes: blob.size, fileCount: prepared.files.length });
}
