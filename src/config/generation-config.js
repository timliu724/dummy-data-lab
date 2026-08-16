import { createGeneratedColumn } from '../schema/output-schema.js';
import { createProviderCatalog } from '../generation/provider-catalog.js';
import { MODE_VALUES } from '../core/constants.js';
import {
  DEFAULT_BUSINESS_FIDELITY,
  businessFidelityModel,
  normaliseBusinessFidelity,
  normaliseBusinessFidelitySettings,
} from '../business/fidelity.js';
import { createDatasetTable } from '../dataset/multi-table-dataset.js';

export const GENERATION_CONFIG_SCHEMA_VERSION = 3;
const MAX_CONFIG_COLUMNS = 200;
const MAX_CONFIG_TABLES = 50;
const CONFIG_FORMAT = 'dummy-data-generation-config';
const LEGACY_PROJECT_FORMAT = 'dummy-data-project-config';
const catalog = createProviderCatalog();

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  return value;
}

function normalizeGeneratedColumns(columns) {
  if (columns.length > MAX_CONFIG_COLUMNS) throw new RangeError(`A configuration can contain at most ${MAX_CONFIG_COLUMNS} generated columns.`);
  const ids = new Set();
  return Object.freeze(columns.map((column, index) => {
    if (!column || typeof column !== 'object' || Array.isArray(column)) throw new TypeError(`Generated column ${index + 1} is invalid.`);
    if (!catalog.hasGenerator(column.generatorType)) throw new RangeError(`Unsupported generator type: ${column.generatorType}`);
    const id = String(column.id ?? `imported-${index + 1}`);
    if (ids.has(id)) throw new RangeError(`Duplicate generated column ID: ${id}`);
    ids.add(id);
    if (!column.settings || typeof column.settings !== 'object' || Array.isArray(column.settings)) {
      throw new TypeError(`${column.name ?? `Column ${index + 1}`}: settings must be an object.`);
    }
    return createGeneratedColumn({
      id,
      name: String(column.name ?? '').trim(),
      generatorType: column.generatorType,
      position: index,
      enabled: column.enabled !== false,
      settings: { ...column.settings },
      blockId: column.blockId ?? null,
      blockLabel: column.blockLabel ?? null,
    });
  }));
}

function normalizeSequence(value, fallback, name) {
  if (value === null || value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`);
  return value;
}

function normalizeScratchProject({
  workflowKind,
  scratchStructure,
  datasetTables,
  activeDatasetTableId,
  datasetTableSequence,
  templateBlockSequence,
}) {
  if (workflowKind !== 'SCRATCH') return null;
  const structure = scratchStructure ?? 'SINGLE';
  if (!['SINGLE', 'MULTI'].includes(structure)) throw new RangeError('scratchStructure must be SINGLE or MULTI.');
  if (structure === 'SINGLE') {
    return Object.freeze({
      structure,
      activeTableId: null,
      tableSequence: 0,
      templateBlockSequence: normalizeSequence(templateBlockSequence, 0, 'templateBlockSequence'),
      tables: Object.freeze([]),
    });
  }

  const tables = requireArray(datasetTables, 'datasetTables');
  if (tables.length === 0) throw new RangeError('A related-table configuration must contain at least one table.');
  if (tables.length > MAX_CONFIG_TABLES) throw new RangeError(`A configuration can contain at most ${MAX_CONFIG_TABLES} tables.`);
  const tableIds = new Set();
  const normalizedTables = Object.freeze(tables.map((table, index) => {
    if (!table || typeof table !== 'object' || Array.isArray(table)) throw new TypeError(`Table ${index + 1} is invalid.`);
    const id = String(table.id ?? '').trim();
    if (!id) throw new RangeError(`Table ${index + 1} needs an ID.`);
    if (tableIds.has(id)) throw new RangeError(`Duplicate table ID: ${id}`);
    tableIds.add(id);
    const rowCount = table.rowCount ?? null;
    if (rowCount !== null && (!Number.isInteger(rowCount) || rowCount <= 0)) {
      throw new RangeError(`${table.name ?? `Table ${index + 1}`}: rowCount must be null or a positive integer.`);
    }
    const columns = normalizeGeneratedColumns(requireArray(table.columns, `${table.name ?? `Table ${index + 1}`} columns`));
    return createDatasetTable({ ...table, id, columns, rowCount });
  }));
  const requestedActiveId = activeDatasetTableId === null || activeDatasetTableId === undefined
    ? normalizedTables[0].id
    : String(activeDatasetTableId);
  if (!tableIds.has(requestedActiveId)) throw new RangeError(`Active table ID ${requestedActiveId} was not found.`);
  return Object.freeze({
    structure,
    activeTableId: requestedActiveId,
    tableSequence: normalizeSequence(datasetTableSequence, normalizedTables.length, 'datasetTableSequence'),
    templateBlockSequence: normalizeSequence(templateBlockSequence, 0, 'templateBlockSequence'),
    tables: normalizedTables,
  });
}

export function createGenerationConfig({
  appVersion,
  workflowKind,
  requestedRowCount,
  mode,
  businessFidelity = DEFAULT_BUSINESS_FIDELITY,
  businessFidelitySettings = null,
  templateId = null,
  generatedColumns = [],
  generatedColumnSequence = null,
  scratchStructure = 'SINGLE',
  datasetTables = [],
  activeDatasetTableId = null,
  datasetTableSequence = null,
  templateBlockSequence = null,
  sourceHeaders = [],
  policies = [],
  relationships = [],
} = {}) {
  if (!['TRANSFORM', 'SCRATCH'].includes(workflowKind)) throw new RangeError('workflowKind must be TRANSFORM or SCRATCH.');
  if (!Number.isInteger(requestedRowCount) || requestedRowCount <= 0) throw new RangeError('requestedRowCount must be a positive integer.');
  if (!MODE_VALUES.includes(mode)) throw new RangeError(`Unsupported protection mode: ${mode}.`);
  const fidelity = normaliseBusinessFidelity(businessFidelity);
  const fidelitySettings = normaliseBusinessFidelitySettings(fidelity, businessFidelitySettings ?? {});
  const scratch = normalizeScratchProject({
    workflowKind,
    scratchStructure,
    datasetTables,
    activeDatasetTableId,
    datasetTableSequence,
    templateBlockSequence,
  });
  const activeProjectColumns = scratch?.structure === 'MULTI'
    ? scratch.tables.find((table) => table.id === scratch.activeTableId)?.columns ?? []
    : generatedColumns;
  const normalizedColumns = normalizeGeneratedColumns(requireArray(activeProjectColumns, 'generatedColumns'));
  return Object.freeze({
    format: CONFIG_FORMAT,
    schemaVersion: GENERATION_CONFIG_SCHEMA_VERSION,
    appVersion: String(appVersion),
    workflowKind,
    requestedRowCount,
    mode: String(mode),
    businessFidelity: fidelity,
    businessFidelitySettings: fidelitySettings,
    templateId: templateId ? String(templateId) : null,
    generatedColumns: normalizedColumns,
    generatedColumnSequence: normalizeSequence(generatedColumnSequence, normalizedColumns.length, 'generatedColumnSequence'),
    source: Object.freeze({
      headers: Object.freeze([...requireArray(sourceHeaders, 'sourceHeaders')].map(String)),
      policies: Object.freeze([...requireArray(policies, 'policies')]),
      relationships: Object.freeze([...requireArray(relationships, 'relationships')]),
    }),
    scratch,
  });
}

export function serializeGenerationConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function parseGenerationConfig(text) {
  if (typeof text !== 'string') throw new TypeError('Configuration text is required.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyntaxError('The selected file is not valid JSON.');
  }
  if (parsed?.format === LEGACY_PROJECT_FORMAT && parsed?.schemaVersion === 1) {
    const legacyTables = requireArray(parsed.tables, 'tables');
    const activeTable = legacyTables[0] ?? null;
    return createGenerationConfig({
      appVersion: parsed.appVersion,
      workflowKind: 'SCRATCH',
      requestedRowCount: 200,
      mode: 'SAFE_TEST_DATA',
      generatedColumns: activeTable?.columns ?? [],
      scratchStructure: 'MULTI',
      datasetTables: legacyTables,
      activeDatasetTableId: activeTable?.id ?? null,
      datasetTableSequence: legacyTables.length,
    });
  }
  if (![1, 2, GENERATION_CONFIG_SCHEMA_VERSION].includes(parsed?.schemaVersion)) {
    throw new RangeError(`Unsupported configuration schema version: ${parsed?.schemaVersion ?? 'missing'}.`);
  }
  return createGenerationConfig({
    ...parsed,
    businessFidelity: parsed.businessFidelity ?? DEFAULT_BUSINESS_FIDELITY,
    businessFidelitySettings: parsed.businessFidelitySettings
      ?? businessFidelityModel(parsed.businessFidelity ?? DEFAULT_BUSINESS_FIDELITY).settings,
    sourceHeaders: parsed.source?.headers ?? [],
    policies: parsed.source?.policies ?? [],
    relationships: parsed.source?.relationships ?? [],
    generatedColumnSequence: parsed.generatedColumnSequence ?? parsed.generatedColumns?.length ?? 0,
    scratchStructure: parsed.scratch?.structure ?? 'SINGLE',
    datasetTables: parsed.scratch?.tables ?? [],
    activeDatasetTableId: parsed.scratch?.activeTableId ?? null,
    datasetTableSequence: parsed.scratch?.tableSequence ?? null,
    templateBlockSequence: parsed.scratch?.templateBlockSequence ?? null,
  });
}
