import { generateStandaloneDataset } from '../generation/generated-column-engine.js';
import { createGeneratedColumn } from '../schema/output-schema.js';
import { createRandomSource } from '../generation/random-source.js';

export const DATASET_SCHEMA_VERSION = 1;

function cleanTableName(name) {
  const value = String(name ?? '').trim();
  if (!value) throw new RangeError('Every table needs a name.');
  if (value.length > 50) throw new RangeError('Table names must be 50 characters or shorter.');
  return value;
}

function cloneColumns(columns = []) {
  if (!Array.isArray(columns)) throw new TypeError('Table columns must be an array.');
  return Object.freeze(columns.map((column, position) => createGeneratedColumn({
    ...column,
    position,
    settings: { ...column.settings },
  })));
}

export function createDatasetTable({ id, name, columns = [], rowCount = null, primaryKeyColumnId = null } = {}) {
  const tableName = cleanTableName(name);
  return Object.freeze({
    id: String(id || `table-${tableName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data'}`),
    name: tableName,
    columns: cloneColumns(columns),
    rowCount: rowCount === null ? null : Number(rowCount),
    primaryKeyColumnId: primaryKeyColumnId ?? null,
  });
}

export function validateDatasetTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0) throw new RangeError('Add at least one table to the project.');
  const ids = new Set();
  const names = new Set();
  for (const table of tables) {
    if (ids.has(table.id)) throw new RangeError(`Table ID ${table.id} is duplicated.`);
    ids.add(table.id);
    const normalizedName = cleanTableName(table.name).toLowerCase();
    if (names.has(normalizedName)) throw new RangeError(`Table name “${table.name}” is already used.`);
    names.add(normalizedName);
    if (!Array.isArray(table.columns) || table.columns.filter((column) => column.enabled !== false).length === 0) {
      throw new RangeError(`${table.name}: add at least one enabled column.`);
    }
    if (table.primaryKeyColumnId) {
      const primary = table.columns.find((column) => column.id === table.primaryKeyColumnId && column.enabled !== false);
      if (!primary) throw new RangeError(`${table.name}: the selected primary key is unavailable.`);
      if (!primary.settings?.unique || Number(primary.settings?.nullRate ?? 0) !== 0) {
        throw new RangeError(`${table.name}.${primary.name}: a primary key must be unique and never blank.`);
      }
    }
  }
  const tableById = new Map(tables.map((table) => [table.id, table]));
  for (const table of tables) {
    const drivers = table.columns.filter((column) => column.enabled !== false
      && column.generatorType === 'foreign-key' && column.settings?.cardinalityMode === 'DRIVER');
    if (drivers.length > 1) throw new RangeError(`${table.name}: only one foreign key can control the child row count.`);
    for (const foreignKey of table.columns.filter((column) => column.enabled !== false && column.generatorType === 'foreign-key')) {
      const target = tableById.get(foreignKey.settings?.targetTableId);
      if (!target) throw new RangeError(`${table.name}.${foreignKey.name}: choose an available target table.`);
      if (!target.primaryKeyColumnId || target.primaryKeyColumnId !== foreignKey.settings?.targetColumnId) {
        throw new RangeError(`${table.name}.${foreignKey.name}: the target must be ${target.name}'s current primary key.`);
      }
      if (target.id === table.id) throw new RangeError(`${table.name}.${foreignKey.name}: self-referencing keys are not supported yet.`);
      if (foreignKey.settings?.cardinalityMode === 'DRIVER') {
        const minimum = Number(foreignKey.settings?.minimumPerParent);
        const maximum = Number(foreignKey.settings?.maximumPerParent);
        if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < Math.max(1, minimum) || maximum > 1000) {
          throw new RangeError(`${table.name}.${foreignKey.name}: children per parent must use whole numbers from 0 to 1000, with maximum at least 1 and not below minimum.`);
        }
      }
    }
    for (const ruleColumn of table.columns.filter((column) => column.enabled !== false
      && ['lookup-foreign', 'date-after-foreign'].includes(column.generatorType))) {
      const foreignKey = table.columns.find((column) => column.id === ruleColumn.settings?.foreignKeyColumnId && column.generatorType === 'foreign-key');
      if (!foreignKey) throw new RangeError(`${table.name}.${ruleColumn.name}: choose a foreign key in this table.`);
      const target = tableById.get(ruleColumn.settings?.targetTableId);
      const targetColumn = target?.columns.find((column) => column.id === ruleColumn.settings?.targetColumnId && column.enabled !== false);
      if (!target || !targetColumn || foreignKey.settings.targetTableId !== target.id) {
        throw new RangeError(`${table.name}.${ruleColumn.name}: choose a field from the linked parent table.`);
      }
      if (ruleColumn.generatorType === 'date-after-foreign') {
        if (!['date', 'date-after', 'date-after-foreign'].includes(targetColumn.generatorType)) {
          throw new RangeError(`${table.name}.${ruleColumn.name}: the linked parent field must be a date.`);
        }
        const minimum = Number(ruleColumn.settings?.minimumDays);
        const maximum = Number(ruleColumn.settings?.maximumDays);
        if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum || maximum > 36500) {
          throw new RangeError(`${table.name}.${ruleColumn.name}: day offsets must be whole numbers from 0 to 36,500, with maximum not below minimum.`);
        }
      }
    }
  }
  orderDatasetTables(tables);
  return Object.freeze({ valid: true, tableCount: tables.length });
}

export function orderDatasetTables(tables) {
  const byId = new Map(tables.map((table) => [table.id, table]));
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  const visit = (table, trail = []) => {
    if (visited.has(table.id)) return;
    if (visiting.has(table.id)) throw new RangeError(`Table relationship cycle: ${[...trail, table.name].join(' → ')}.`);
    visiting.add(table.id);
    const targetIds = new Set(table.columns
      .filter((column) => column.enabled !== false && column.generatorType === 'foreign-key')
      .map((column) => column.settings?.targetTableId));
    for (const targetId of targetIds) {
      const target = byId.get(targetId);
      if (target) visit(target, [...trail, table.name]);
    }
    visiting.delete(table.id);
    visited.add(table.id);
    ordered.push(table);
  };
  for (const table of tables) visit(table);
  return Object.freeze(ordered);
}

function countDuplicatePrimaryKeyRows(table, generationResult) {
  if (!table.primaryKeyColumnId) return 0;
  const activeColumns = table.columns.filter((column) => column.enabled !== false);
  const primaryIndex = activeColumns.findIndex((column) => column.id === table.primaryKeyColumnId);
  if (primaryIndex < 0) return 0;
  const seen = new Set();
  let duplicatePrimaryKeyCount = 0;
  for (const row of generationResult.rows) {
    const value = row[primaryIndex];
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) duplicatePrimaryKeyCount += 1;
    else seen.add(key);
  }
  return duplicatePrimaryKeyCount;
}

export function generateIndependentDataset({ tables, defaultRowCount, randomFactory } = {}) {
  validateDatasetTables(tables);
  const generatedById = new Map();
  const orderedTables = orderDatasetTables(tables);
  for (const [index, table] of orderedTables.entries()) {
    let requestedRowCount = Number.isInteger(table.rowCount) && table.rowCount > 0 ? table.rowCount : defaultRowCount;
    const random = randomFactory?.(table, index) ?? createRandomSource();
    const externalValuesByColumnId = new Map();
    for (const foreignKey of table.columns.filter((column) => column.enabled !== false && column.generatorType === 'foreign-key')) {
      const targetResult = generatedById.get(foreignKey.settings.targetTableId);
      const targetColumnIndex = targetResult.generationResult.headers.findIndex((_name, columnIndex) => {
        const targetTable = tables.find((entry) => entry.id === foreignKey.settings.targetTableId);
        return targetTable?.columns.filter((column) => column.enabled !== false)[columnIndex]?.id === foreignKey.settings.targetColumnId;
      });
      if (targetColumnIndex < 0) throw new RangeError(`${table.name}.${foreignKey.name}: target key was not generated.`);
      const parentValues = targetResult.generationResult.rows.map((row) => row[targetColumnIndex]);
      if (foreignKey.settings?.cardinalityMode === 'DRIVER') {
        const minimum = Number(foreignKey.settings.minimumPerParent);
        const maximum = Number(foreignKey.settings.maximumPerParent);
        const assignments = parentValues.flatMap((value) => Array.from({ length: random.integer(minimum, maximum) }, () => value));
        if (assignments.length === 0 && parentValues.length > 0) assignments.push(random.pick(parentValues));
        requestedRowCount = assignments.length;
        externalValuesByColumnId.set(foreignKey.id, Object.freeze({ values: Object.freeze(assignments), mode: 'ROW_ALIGNED' }));
      } else {
        externalValuesByColumnId.set(foreignKey.id, Object.freeze({ values: Object.freeze(parentValues), mode: 'SAMPLE' }));
      }
    }
    for (const ruleColumn of table.columns.filter((column) => column.enabled !== false
      && ['lookup-foreign', 'date-after-foreign'].includes(column.generatorType))) {
      const foreignKey = table.columns.find((column) => column.id === ruleColumn.settings.foreignKeyColumnId);
      const targetTable = tables.find((entry) => entry.id === ruleColumn.settings.targetTableId);
      const targetResult = generatedById.get(targetTable.id);
      const targetColumns = targetTable.columns.filter((column) => column.enabled !== false);
      const keyIndex = targetColumns.findIndex((column) => column.id === targetTable.primaryKeyColumnId);
      const valueIndex = targetColumns.findIndex((column) => column.id === ruleColumn.settings.targetColumnId);
      const byKey = new Map(targetResult.generationResult.rows.map((row) => [String(row[keyIndex] ?? ''), row[valueIndex]]));
      externalValuesByColumnId.set(ruleColumn.id, Object.freeze({
        mode: ruleColumn.generatorType === 'date-after-foreign' ? 'LOOKUP_DATE_AFTER' : 'LOOKUP_VALUE',
        values: Object.freeze([...byKey.values()]),
        byKey,
        foreignKeyColumnId: foreignKey.id,
      }));
    }
    const built = generateStandaloneDataset({
      generatedColumns: table.columns,
      requestedRowCount,
      random,
      externalValuesByColumnId,
    });
    const duplicatePrimaryKeyCount = countDuplicatePrimaryKeyRows(table, built.generationResult);
    generatedById.set(table.id, Object.freeze({
      id: table.id,
      name: table.name,
      requestedRowCount,
      outputPlan: built.outputPlan,
      generationResult: built.generationResult,
      validation: Object.freeze({
        valid: built.generationResult.validation.valid && duplicatePrimaryKeyCount === 0,
        duplicatePrimaryKeyCount,
      }),
    }));
  }
  const tableResults = tables.map((table) => generatedById.get(table.id));
  const totalRows = tableResults.reduce((sum, table) => sum + table.generationResult.rows.length, 0);
  const duplicatePrimaryKeyCount = tableResults.reduce((sum, table) => sum + table.validation.duplicatePrimaryKeyCount, 0);
  let orphanForeignKeyCount = 0;
  let cardinalityViolationCount = 0;
  let crossTableRuleViolationCount = 0;
  for (const table of tables) {
    const result = generatedById.get(table.id);
    for (const foreignKey of table.columns.filter((column) => column.enabled !== false && column.generatorType === 'foreign-key')) {
      const columnIndex = table.columns.filter((column) => column.enabled !== false).findIndex((column) => column.id === foreignKey.id);
      const target = generatedById.get(foreignKey.settings.targetTableId);
      const targetTable = tables.find((entry) => entry.id === foreignKey.settings.targetTableId);
      const targetIndex = targetTable.columns.filter((column) => column.enabled !== false).findIndex((column) => column.id === foreignKey.settings.targetColumnId);
      const targetValues = new Set(target.generationResult.rows.map((row) => String(row[targetIndex] ?? '')));
      orphanForeignKeyCount += result.generationResult.rows.filter((row) => !targetValues.has(String(row[columnIndex] ?? ''))).length;
      if (foreignKey.settings?.cardinalityMode === 'DRIVER') {
        const counts = new Map([...targetValues].map((value) => [value, 0]));
        for (const row of result.generationResult.rows) {
          const key = String(row[columnIndex] ?? '');
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const minimum = Number(foreignKey.settings.minimumPerParent);
        const maximum = Number(foreignKey.settings.maximumPerParent);
        cardinalityViolationCount += [...counts.values()].filter((count) => count < minimum || count > maximum).length;
      }
    }
    const activeColumns = table.columns.filter((column) => column.enabled !== false);
    for (const ruleColumn of activeColumns.filter((column) => ['lookup-foreign', 'date-after-foreign'].includes(column.generatorType))) {
      const ruleIndex = activeColumns.findIndex((column) => column.id === ruleColumn.id);
      const foreignIndex = activeColumns.findIndex((column) => column.id === ruleColumn.settings.foreignKeyColumnId);
      const targetTable = tables.find((entry) => entry.id === ruleColumn.settings.targetTableId);
      const targetResult = generatedById.get(targetTable.id);
      const targetColumns = targetTable.columns.filter((column) => column.enabled !== false);
      const targetKeyIndex = targetColumns.findIndex((column) => column.id === targetTable.primaryKeyColumnId);
      const targetValueIndex = targetColumns.findIndex((column) => column.id === ruleColumn.settings.targetColumnId);
      const targetValues = new Map(targetResult.generationResult.rows.map((row) => [String(row[targetKeyIndex] ?? ''), String(row[targetValueIndex] ?? '')]));
      for (const row of result.generationResult.rows) {
        const parentValue = targetValues.get(String(row[foreignIndex] ?? ''));
        const childValue = String(row[ruleIndex] ?? '');
        if (ruleColumn.generatorType === 'lookup-foreign') {
          if (childValue !== parentValue) crossTableRuleViolationCount += 1;
        } else {
          const days = (Date.parse(`${childValue}T00:00:00Z`) - Date.parse(`${parentValue}T00:00:00Z`)) / 86_400_000;
          if (!Number.isFinite(days) || days < ruleColumn.settings.minimumDays || days > ruleColumn.settings.maximumDays) crossTableRuleViolationCount += 1;
        }
      }
    }
  }
  const valid = tableResults.every((table) => table.validation.valid)
    && orphanForeignKeyCount === 0 && cardinalityViolationCount === 0 && crossTableRuleViolationCount === 0;
  return Object.freeze({
    schemaVersion: DATASET_SCHEMA_VERSION,
    tableResults: Object.freeze(tableResults),
    validation: Object.freeze({
      valid,
      tableCount: tableResults.length,
      totalRows,
      duplicatePrimaryKeyCount,
      orphanForeignKeyCount,
      cardinalityViolationCount,
      crossTableRuleViolationCount,
    }),
  });
}
