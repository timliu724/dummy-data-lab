// Match template provenance by stable IDs, never by a field's editable name.
export function describeQuickScratch(columns, definitions) {
  const claimed = new Set();
  const templates = definitions.map(({ templateId, fields }) => {
    const first = columns.find(column => fields.some(field => column.id === field.id || column.id.endsWith('-' + field.id)));
    if (!first) return null;
    const fieldColumns = fields.map(field => columns.find(column => column.blockId === first.blockId
      && (column.id === field.id || column.id.endsWith('-' + field.id))) ?? null);
    fieldColumns.filter(Boolean).forEach(column => claimed.add(column.id));
    return { templateId, fieldColumns, enabledFields: fields.filter((field, i) => fieldColumns[i]?.enabled !== false && fieldColumns[i]).map(field => field.name) };
  }).filter(Boolean);
  return { templates, customColumns: columns.filter(column => !claimed.has(column.id)), columnOrder: columns.map(column => column.id) };
}

export function preserveQuickColumn(column, changes, defaults) {
  return { ...column, ...changes, settings: changes.generatorType === column.generatorType
    ? { ...column.settings } : defaults(changes.generatorType) };
}
