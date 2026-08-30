import { createGenerationResult, createOutputPlan } from '../core/contracts.js';
import { createRandomSource } from './random-source.js';
import { fictionalAddress, fictionalEmail, fictionalPersonName } from './fictional-values.js';

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

function uuid(random) {
  const hex = [...'0123456789abcdef'];
  const part = (length) => Array.from({ length }, () => random.pick(hex)).join('');
  return `${part(8)}-${part(4)}-4${part(3)}-${random.pick(['8', '9', 'a', 'b'])}${part(3)}-${part(12)}`;
}

function categoryValues(settings) {
  const raw = settings.values ?? settings.categories ?? ['Active', 'Pending', 'Closed'];
  if (Array.isArray(raw)) return raw.map(String).map((value) => value.trim()).filter(Boolean);
  return String(raw).split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
}

function weightedPick(values, weights, random) {
  if (!Array.isArray(weights) || weights.length !== values.length) return random.pick(values);
  const normalized = weights.map(Number);
  if (normalized.some((weight) => !Number.isFinite(weight) || weight < 0)) return random.pick(values);
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return random.pick(values);
  let cursor = random.nextFloat() * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= normalized[index];
    if (cursor < 0) return values[index];
  }
  return values.at(-1);
}

function parseIsoDay(value, fallback) {
  const parsed = Date.parse(`${value ?? fallback}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : Math.floor(Date.parse(`${fallback}T00:00:00Z`) / 86_400_000);
}

function finiteCapacity(column) {
  const settings = column.settings ?? {};
  if (column.generatorType === 'boolean') return 2;
  if (column.generatorType === 'constant') return 1;
  if (column.generatorType === 'category') return new Set(categoryValues(settings)).size;
  if (column.generatorType === 'integer') {
    const minimum = Number.isInteger(settings.minimum) ? settings.minimum : 1;
    const maximum = Number.isInteger(settings.maximum) ? settings.maximum : 1000;
    return Math.abs(maximum - minimum) + 1;
  }
  if (column.generatorType === 'date') {
    return Math.abs(parseIsoDay(settings.endDate, '2035-12-31') - parseIsoDay(settings.startDate, '2020-01-01')) + 1;
  }
  return Number.POSITIVE_INFINITY;
}

function dependencyId(column) {
  return ['copy-column', 'template', 'date-after', 'lookup-foreign', 'date-after-foreign'].includes(column.generatorType)
    ? column.settings?.sourceColumnId ?? column.settings?.foreignKeyColumnId ?? null
    : null;
}

function externalValues(entry) {
  if (Array.isArray(entry)) return entry;
  return Array.isArray(entry?.values) ? entry.values : null;
}

export function orderGeneratedColumns(generatedColumns) {
  const active = generatedColumns.filter((column) => column.enabled !== false);
  const byId = new Map(active.map((column) => [column.id, column]));
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  const visit = (column, trail = []) => {
    if (visited.has(column.id)) return;
    if (visiting.has(column.id)) {
      const cycle = [...trail, column.name].join(' → ');
      throw new RangeError(`Generated column dependency cycle: ${cycle}.`);
    }
    visiting.add(column.id);
    const dependency = byId.get(dependencyId(column));
    if (dependency) visit(dependency, [...trail, column.name]);
    visiting.delete(column.id);
    visited.add(column.id);
    ordered.push(column);
  };
  for (const column of active) visit(column);
  return Object.freeze(ordered);
}

function referencedValue(column, { row, headers, valuesById }) {
  const settings = column.settings ?? {};
  if (settings.sourceColumnId && valuesById?.has(settings.sourceColumnId)) {
    return valuesById.get(settings.sourceColumnId);
  }
  const wantedName = String(settings.sourceColumnName ?? '').trim().toLowerCase();
  const index = headers.findIndex((header) => String(header).trim().toLowerCase() === wantedName);
  return index >= 0 ? String(row[index] ?? '') : '';
}

export function validateGeneratedColumns({ sourceHeaders = [], generatedColumns = [], rowCount, externalValuesByColumnId = new Map() }) {
  const names = new Set(sourceHeaders.map((name) => String(name).trim().toLowerCase()));
  const generatedIds = new Set(generatedColumns.map((column) => column.id));
  for (const column of generatedColumns.filter((entry) => entry.enabled !== false)) {
    const name = String(column.name ?? '').trim();
    if (!name) throw new RangeError('Every generated column needs a name.');
    if (names.has(name.toLowerCase())) throw new RangeError(`Column name "${name}" is already used. Choose a unique name.`);
    names.add(name.toLowerCase());
    const nullRate = Number(column.settings?.nullRate ?? 0);
    if (!Number.isFinite(nullRate) || nullRate < 0 || nullRate > 100) {
      throw new RangeError(`${name}: null rate must be from 0 to 100.`);
    }
    if (['copy-column', 'template', 'date-after'].includes(column.generatorType)) {
      const sourceColumnId = column.settings?.sourceColumnId;
      const sourceColumnName = String(column.settings?.sourceColumnName ?? '').trim();
      const sourceNameExists = sourceHeaders.some((header) => String(header).trim().toLowerCase() === sourceColumnName.toLowerCase());
      if (!sourceColumnId || (!generatedIds.has(sourceColumnId) && !sourceNameExists)) {
        throw new RangeError(`${name}: choose an available source column for this dependency.`);
      }
      if (sourceColumnId === column.id) throw new RangeError(`${name}: a column cannot depend on itself.`);
    }
    if (column.generatorType === 'foreign-key') {
      const values = externalValues(externalValuesByColumnId.get(column.id));
      if (!Array.isArray(values) || values.length === 0) {
        throw new RangeError(`${name}: its foreign-key target has no generated values.`);
      }
    }
    if (['lookup-foreign', 'date-after-foreign'].includes(column.generatorType)) {
      const externalEntry = externalValuesByColumnId.get(column.id);
      if (!(externalEntry?.byKey instanceof Map) || !column.settings?.foreignKeyColumnId) {
        throw new RangeError(`${name}: its linked-parent rule is incomplete.`);
      }
      if (!generatedIds.has(column.settings.foreignKeyColumnId)) {
        throw new RangeError(`${name}: choose an available foreign key in this table.`);
      }
    }
  }
  orderGeneratedColumns(generatedColumns);
  return Object.freeze({ valid: true });
}

export function validateGeneratedOutput({ rows, sourceColumnCount, generatedColumns }) {
  const issues = [];
  const warnings = [];
  const invalidRowIndexes = new Set();
  const active = generatedColumns.filter((column) => column.enabled !== false);
  for (const [generatedIndex, column] of active.entries()) {
    const outputIndex = sourceColumnCount + generatedIndex;
    const settings = column.settings ?? {};
    const values = rows.map((row) => String(row[outputIndex] ?? ''));
    const blanks = values.filter((value) => value === '').length;
    const expectedBlanks = Math.round(rows.length * Number(settings.nullRate ?? 0) / 100);
    if (blanks !== expectedBlanks) {
      issues.push(Object.freeze({
        code: 'GENERATED_NULL_COUNT_MISMATCH',
        message: `${column.name}: expected ${expectedBlanks} blank values but generated ${blanks}.`,
        details: Object.freeze({ columnName: column.name, expectedBlanks, actualBlanks: blanks }),
      }));
    }
    if (settings.unique) {
      const seen = new Set();
      let duplicateRowCount = 0;
      values.forEach((value) => {
        if (!value) return;
        if (seen.has(value)) duplicateRowCount += 1;
        else seen.add(value);
      });
      if (duplicateRowCount > 0) {
        warnings.push(Object.freeze({
          code: 'GENERATED_UNIQUENESS_RELAXED',
          message: `${column.name}: repeated non-blank values were generated.`,
          details: Object.freeze({
            columnName: column.name,
            nonEmptyCount: values.length - blanks,
            distinctCount: seen.size,
            duplicateRowCount,
          }),
        }));
      }
    }
    values.forEach((value, rowIndex) => {
      if (!value) return;
      let valid = true;
      if (column.generatorType === 'integer') {
        const number = Number(value);
        const minimum = Number.isInteger(settings.minimum) ? settings.minimum : 1;
        const maximum = Number.isInteger(settings.maximum) ? settings.maximum : 1000;
        valid = Number.isInteger(number) && number >= Math.min(minimum, maximum) && number <= Math.max(minimum, maximum);
      } else if (column.generatorType === 'decimal') {
        const number = Number(value);
        valid = Number.isFinite(number);
      } else if (column.generatorType === 'category') {
        valid = categoryValues(settings).includes(value);
      } else if (column.generatorType === 'constant') {
        valid = value === String(settings.value ?? 'Test');
      } else if (column.generatorType === 'date') {
        const day = parseIsoDay(value, '1970-01-01');
        const first = parseIsoDay(settings.startDate, '2020-01-01');
        const last = parseIsoDay(settings.endDate, '2035-12-31');
        valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && day >= Math.min(first, last) && day <= Math.max(first, last);
      }
      if (!valid) invalidRowIndexes.add(rowIndex);
    });
  }
  if (invalidRowIndexes.size > 0 && !issues.some((issue) => issue.code === 'GENERATED_UNIQUENESS_VIOLATION')) {
    issues.push(Object.freeze({
      code: 'GENERATED_VALUE_OUTSIDE_RULES',
      message: `${invalidRowIndexes.size} rows contain generated values outside their configured rules.`,
      details: Object.freeze({ invalidRowCount: invalidRowIndexes.size }),
    }));
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    warnings: Object.freeze(warnings),
    invalidRowIndexes: Object.freeze([...invalidRowIndexes]),
  });
}

export function generateColumnValue(column, { rowIndex, random, row = [], headers = [], valuesById = new Map(), externalValues: suppliedValues = null, externalMode = 'SAMPLE', externalEntry = null }) {
  const settings = column.settings ?? {};
  switch (column.generatorType) {
    case 'person-name':
      return fictionalPersonName(random);
    case 'email':
      return fictionalEmail(random);
    case 'phone':
      return `04${pad(random.integer(0, 99))} ${pad(random.integer(0, 999), 3)} ${pad(random.integer(0, 999), 3)}`;
    case 'address':
      return fictionalAddress(random);
    case 'integer': {
      const minimum = Number.isInteger(settings.minimum) ? settings.minimum : 1;
      const maximum = Number.isInteger(settings.maximum) ? settings.maximum : 1000;
      return String(random.integer(Math.min(minimum, maximum), Math.max(minimum, maximum)));
    }
    case 'decimal': {
      const minimum = Number.isFinite(settings.minimum) ? settings.minimum : 0;
      const maximum = Number.isFinite(settings.maximum) ? settings.maximum : 1000;
      const decimals = Number.isInteger(settings.decimals) ? Math.min(8, Math.max(0, settings.decimals)) : 2;
      return (minimum + random.nextFloat() * (maximum - minimum)).toFixed(decimals);
    }
    case 'boolean':
      return random.pick(['true', 'false']);
    case 'category': {
      const values = categoryValues(settings);
      const weights = Array.isArray(settings.weights)
        ? settings.weights
        : String(settings.weights ?? '').split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
      return values.length > 0 ? weightedPick(values, weights, random) : '';
    }
    case 'date': {
      const firstDay = parseIsoDay(settings.startDate, '2020-01-01');
      const lastDay = parseIsoDay(settings.endDate, '2035-12-31');
      const day = random.integer(Math.min(firstDay, lastDay), Math.max(firstDay, lastDay));
      return new Date(day * 86_400_000).toISOString().slice(0, 10);
    }
    case 'datetime':
      return `${random.integer(2020, 2035)}-${pad(random.integer(1, 12))}-${pad(random.integer(1, 28))} ${pad(random.integer(0, 23))}:${pad(random.integer(0, 59))}:00`;
    case 'sequence': {
      const start = Number.isInteger(settings.start) ? settings.start : 1;
      const step = Number.isInteger(settings.step) && settings.step !== 0 ? settings.step : 1;
      const prefix = String(settings.prefix ?? 'ID-');
      const width = Number.isInteger(settings.width) ? Math.max(1, Math.min(16, settings.width)) : 5;
      return `${prefix}${pad(start + rowIndex * step, width)}`;
    }
    case 'uuid':
      return uuid(random);
    case 'constant':
      return String(settings.value ?? 'Test');
    case 'copy-column':
      return referencedValue(column, { row, headers, valuesById });
    case 'template':
      return `${String(settings.prefix ?? '')}${referencedValue(column, { row, headers, valuesById })}${String(settings.suffix ?? '')}`;
    case 'date-after': {
      const source = referencedValue(column, { row, headers, valuesById });
      const sourceTime = Date.parse(`${source}T00:00:00Z`);
      if (!Number.isFinite(sourceTime)) return '';
      const minimumDays = Number.isInteger(settings.minimumDays) ? settings.minimumDays : 1;
      const maximumDays = Number.isInteger(settings.maximumDays) ? settings.maximumDays : 30;
      const offset = random.integer(Math.min(minimumDays, maximumDays), Math.max(minimumDays, maximumDays));
      return new Date(sourceTime + offset * 86_400_000).toISOString().slice(0, 10);
    }
    case 'foreign-key':
      return Array.isArray(suppliedValues) && suppliedValues.length > 0
        ? String(externalMode === 'ROW_ALIGNED' ? suppliedValues[rowIndex % suppliedValues.length] : random.pick(suppliedValues))
        : '';
    case 'lookup-foreign': {
      const foreignValue = String(valuesById.get(settings.foreignKeyColumnId) ?? '');
      return String(externalEntry?.byKey?.get(foreignValue) ?? '');
    }
    case 'date-after-foreign': {
      const foreignValue = String(valuesById.get(settings.foreignKeyColumnId) ?? '');
      const parentValue = externalEntry?.byKey?.get(foreignValue);
      const parentTime = Date.parse(`${parentValue}T00:00:00Z`);
      if (!Number.isFinite(parentTime)) return '';
      const minimumDays = Number.isInteger(settings.minimumDays) ? settings.minimumDays : 1;
      const maximumDays = Number.isInteger(settings.maximumDays) ? settings.maximumDays : 30;
      return new Date(parentTime + random.integer(Math.min(minimumDays, maximumDays), Math.max(minimumDays, maximumDays)) * 86_400_000).toISOString().slice(0, 10);
    }
    default:
      throw new RangeError(`Unsupported generator type: ${column.generatorType}`);
  }
}

export function appendGeneratedColumns({ generationResult, generatedColumns = [], random = createRandomSource(), externalValuesByColumnId = new Map() }) {
  if (!generationResult) throw new TypeError('generationResult is required.');
  const active = generatedColumns.filter((column) => column.enabled !== false);
  if (active.length === 0) return generationResult;
  validateGeneratedColumns({
    sourceHeaders: generationResult.headers,
    generatedColumns: active,
    rowCount: generationResult.rows.length,
    externalValuesByColumnId,
  });
  const headers = [...generationResult.headers, ...active.map((column) => String(column.name).trim())];
  const generationOrder = orderGeneratedColumns(active);
  const uniqueValues = new Map(active.filter((column) => column.settings?.unique).map((column) => [column.id, new Set()]));
  const nullRows = new Map(active.map((column) => {
    const count = Math.round(generationResult.rows.length * Number(column.settings?.nullRate ?? 0) / 100);
    const indexes = new Set();
    while (indexes.size < count) indexes.add(random.integer(0, generationResult.rows.length - 1));
    return [column.id, indexes];
  }));
  const rows = generationResult.rows.map((sourceRow, rowIndex) => {
    const row = [...sourceRow];
    const valuesById = new Map();
    for (const column of generationOrder) {
      if (nullRows.get(column.id)?.has(rowIndex)) {
        valuesById.set(column.id, '');
        continue;
      }
      let value;
      let attempt = 0;
      const claimed = uniqueValues.get(column.id);
      const capacity = finiteCapacity(column);
      const uniquenessExhausted = claimed && Number.isFinite(capacity) && claimed.size >= capacity;
      do {
        const externalEntry = externalValuesByColumnId.get(column.id);
        value = generateColumnValue(column, {
          rowIndex: column.generatorType === 'sequence' ? rowIndex + attempt * generationResult.rows.length : rowIndex,
          random,
          row: sourceRow,
          headers: generationResult.headers,
          valuesById,
          externalValues: externalValues(externalEntry),
          externalMode: externalEntry?.mode ?? 'SAMPLE',
          externalEntry,
        });
        attempt += 1;
      } while (!uniquenessExhausted && claimed?.has(value) && attempt < 256);
      uniqueValues.get(column.id)?.add(value);
      valuesById.set(column.id, value);
    }
    row.push(...active.map((column) => valuesById.get(column.id) ?? ''));
    return Object.freeze(row);
  });
  const generatedValidation = validateGeneratedOutput({
    rows,
    sourceColumnCount: generationResult.headers.length,
    generatedColumns: active,
  });
  const issues = Object.freeze([...generationResult.issues, ...generatedValidation.issues]);
  const warnings = Object.freeze([...(generationResult.warnings ?? []), ...generatedValidation.warnings]);
  return createGenerationResult({
    ...generationResult,
    headers: Object.freeze(headers),
    rows: Object.freeze(rows),
    issues,
    warnings,
    validation: Object.freeze({
      ...generationResult.validation,
      valid: generationResult.validation.valid && generatedValidation.valid,
      issueCount: issues.length,
      generatedColumnsValid: generatedValidation.valid,
      generatedInvalidRowCount: generatedValidation.invalidRowIndexes.length,
    }),
    statistics: Object.freeze({
      ...generationResult.statistics,
      generatedColumnCount: active.length,
    }),
  });
}

export function generateStandaloneDataset({ generatedColumns = [], requestedRowCount, random = createRandomSource(), externalValuesByColumnId = new Map() }) {
  const outputPlan = createOutputPlan({
    inputRowCount: null,
    requestedRowCount,
    recommendedMinimumRows: 0,
    strategy: 'BALANCED',
  });
  const emptyResult = createGenerationResult({
    outputPlan,
    headers: Object.freeze([]),
    rows: Object.freeze(Array.from({ length: requestedRowCount }, () => Object.freeze([]))),
    issues: Object.freeze([]),
    warnings: outputPlan.warnings,
    sourcePreviewReferences: Object.freeze([]),
    validation: Object.freeze({ valid: true, issueCount: 0, invalidRowCount: 0, remediationAttempts: 0 }),
    statistics: Object.freeze({ inputRowCount: null, requestedRowCount, generatedRowCount: requestedRowCount }),
  });
  const generationResult = appendGeneratedColumns({ generationResult: emptyResult, generatedColumns, random, externalValuesByColumnId });
  return Object.freeze({ generationResult, outputPlan });
}
