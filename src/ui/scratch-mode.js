export const BASIC_GENERATOR_IDS = Object.freeze([
  'person-name', 'email', 'phone', 'address',
  'integer', 'decimal', 'boolean', 'category',
  'date', 'datetime', 'sequence', 'uuid',
]);

export const BASIC_QUICK_ADD_IDS = Object.freeze([
  'person-name', 'email', 'phone', 'date', 'decimal', 'category', 'sequence',
]);

const MANAGED_GENERATOR_IDS = new Set([
  'copy-column', 'template', 'date-after',
  'foreign-key', 'lookup-foreign', 'date-after-foreign',
]);

export function basicProtectedColumnIds({ table = null, columns = [] } = {}) {
  const protectedIds = new Set();
  if (table?.primaryKeyColumnId) protectedIds.add(table.primaryKeyColumnId);
  for (const column of columns) {
    if (MANAGED_GENERATOR_IDS.has(column.generatorType)) protectedIds.add(column.id);
    const referencedId = column.settings?.sourceColumnId ?? column.settings?.foreignKeyColumnId;
    if (referencedId) protectedIds.add(referencedId);
  }
  return Object.freeze([...protectedIds]);
}

export function scratchAdvancedSummary({ tables = [], activeColumns = [] } = {}) {
  const projectTables = tables.length > 0
    ? tables
    : [{ id: 'single-table', name: 'Current table', columns: activeColumns, primaryKeyColumnId: null }];
  const columns = projectTables.flatMap((table) => table.columns ?? []);
  const primaryKeyCount = projectTables.filter((table) => table.primaryKeyColumnId).length;
  const foreignKeyCount = columns.filter((column) => column.generatorType === 'foreign-key').length;
  const childCountRuleCount = columns.filter((column) => column.generatorType === 'foreign-key'
    && column.settings?.cardinalityMode === 'DRIVER').length;
  const linkedRuleCount = columns.filter((column) => ['lookup-foreign', 'date-after-foreign'].includes(column.generatorType)).length;
  const dependentFieldCount = columns.filter((column) => ['copy-column', 'template', 'date-after'].includes(column.generatorType)).length;
  const activeRuleCount = primaryKeyCount + foreignKeyCount + childCountRuleCount + linkedRuleCount + dependentFieldCount;
  const parts = [];
  if (primaryKeyCount) parts.push(`${primaryKeyCount} primary key${primaryKeyCount === 1 ? '' : 's'}`);
  if (foreignKeyCount) parts.push(`${foreignKeyCount} foreign key${foreignKeyCount === 1 ? '' : 's'}`);
  if (childCountRuleCount) parts.push(`${childCountRuleCount} child-count rule${childCountRuleCount === 1 ? '' : 's'}`);
  if (linkedRuleCount) parts.push(`${linkedRuleCount} linked field${linkedRuleCount === 1 ? '' : 's'}`);
  if (dependentFieldCount) parts.push(`${dependentFieldCount} dependent field${dependentFieldCount === 1 ? '' : 's'}`);
  return Object.freeze({
    tableCount: projectTables.length,
    columnCount: columns.filter((column) => column.enabled !== false).length,
    primaryKeyCount,
    foreignKeyCount,
    childCountRuleCount,
    linkedRuleCount,
    dependentFieldCount,
    activeRuleCount,
    parts: Object.freeze(parts),
    hasAdvancedRules: activeRuleCount > 0,
  });
}
