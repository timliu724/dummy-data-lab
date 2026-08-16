export function datasetIntegrityModel({ tables, datasetResult, probe = false }) {
  if (!datasetResult || !Array.isArray(datasetResult.tableResults)) return null;
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const rows = datasetResult.tableResults.map((result) => {
    const table = tableById.get(result.id);
    const activeColumns = table?.columns.filter((column) => column.enabled !== false) ?? [];
    const primary = activeColumns.find((column) => column.id === table?.primaryKeyColumnId);
    return Object.freeze({
      id: result.id,
      name: result.name,
      rowCount: result.generationResult.rows.length,
      columnCount: result.generationResult.headers.length,
      primaryKey: primary?.name ?? 'Not selected',
      foreignKeyCount: activeColumns.filter((column) => column.generatorType === 'foreign-key').length,
      linkedRuleCount: activeColumns.filter((column) => ['lookup-foreign', 'date-after-foreign'].includes(column.generatorType)).length,
      duplicatePrimaryKeyCount: result.validation?.duplicatePrimaryKeyCount ?? 0,
      valid: result.validation?.valid ?? result.generationResult.validation.valid,
    });
  });
  return Object.freeze({
    probe,
    valid: datasetResult.validation.valid,
    tableCount: datasetResult.validation.tableCount,
    totalRows: datasetResult.validation.totalRows,
    duplicatePrimaryKeyCount: datasetResult.validation.duplicatePrimaryKeyCount ?? 0,
    orphanForeignKeyCount: datasetResult.validation.orphanForeignKeyCount ?? 0,
    cardinalityViolationCount: datasetResult.validation.cardinalityViolationCount ?? 0,
    crossTableRuleViolationCount: datasetResult.validation.crossTableRuleViolationCount ?? 0,
    tables: Object.freeze(rows),
  });
}

export function summarizeDatasetIntegrityFailure(validation = {}) {
  const findings = [];
  const duplicatePrimaryKeyCount = Number(validation.duplicatePrimaryKeyCount ?? 0);
  const orphanForeignKeyCount = Number(validation.orphanForeignKeyCount ?? 0);
  const cardinalityViolationCount = Number(validation.cardinalityViolationCount ?? 0);
  const crossTableRuleViolationCount = Number(validation.crossTableRuleViolationCount ?? 0);
  if (duplicatePrimaryKeyCount > 0) findings.push(`${duplicatePrimaryKeyCount.toLocaleString()} duplicate primary-key row${duplicatePrimaryKeyCount === 1 ? '' : 's'}`);
  if (orphanForeignKeyCount > 0) findings.push(`${orphanForeignKeyCount.toLocaleString()} orphan foreign key${orphanForeignKeyCount === 1 ? '' : 's'}`);
  if (cardinalityViolationCount > 0) findings.push(`${cardinalityViolationCount.toLocaleString()} count violation${cardinalityViolationCount === 1 ? '' : 's'}`);
  if (crossTableRuleViolationCount > 0) findings.push(`${crossTableRuleViolationCount.toLocaleString()} linked-rule error${crossTableRuleViolationCount === 1 ? '' : 's'}`);
  return findings.join('; ') || 'one or more table outputs failed validation';
}

export function renderDatasetIntegrity(container, values) {
  const model = values ? datasetIntegrityModel(values) : null;
  container.hidden = !model;
  container.replaceChildren();
  if (!model) return;
  const documentRef = container.ownerDocument;
  const headline = documentRef.createElement('div');
  headline.className = 'dataset-integrity__headline';
  const title = documentRef.createElement('strong');
  title.textContent = model.probe ? 'Whole-project Probe' : 'Whole-project integrity';
  const status = documentRef.createElement('span');
  status.className = model.valid ? 'is-valid' : 'is-invalid';
  status.textContent = model.valid ? 'PASS' : 'FAIL';
  headline.append(title, status);
  const metrics = documentRef.createElement('div');
  metrics.className = 'dataset-integrity__metrics';
  const metricValues = [
    ['Tables', model.tableCount], ['Rows', model.totalRows], ['Duplicate PK rows', model.duplicatePrimaryKeyCount], ['Orphan keys', model.orphanForeignKeyCount],
    ['Count violations', model.cardinalityViolationCount], ['Linked-rule errors', model.crossTableRuleViolationCount],
  ];
  for (const [label, value] of metricValues) {
    const metric = documentRef.createElement('div');
    metric.className = 'dataset-integrity__metric';
    const small = documentRef.createElement('small'); small.textContent = label;
    const strong = documentRef.createElement('b'); strong.textContent = Number(value).toLocaleString();
    metric.append(small, strong); metrics.append(metric);
  }
  const table = documentRef.createElement('table');
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  ['Table', 'Rows', 'Columns', 'Primary key', 'Duplicate PK rows', 'Foreign keys', 'Linked rules', 'Status'].forEach((label) => {
    const cell = documentRef.createElement('th'); cell.textContent = label; headRow.append(cell);
  });
  head.append(headRow);
  const body = documentRef.createElement('tbody');
  for (const item of model.tables) {
    const row = documentRef.createElement('tr');
    [item.name, item.rowCount, item.columnCount, item.primaryKey, item.duplicatePrimaryKeyCount, item.foreignKeyCount, item.linkedRuleCount].forEach((value) => {
      const cell = documentRef.createElement('td'); cell.textContent = String(value); row.append(cell);
    });
    const cell = documentRef.createElement('td');
    cell.className = item.valid ? 'is-valid' : 'is-invalid'; cell.textContent = item.valid ? 'PASS' : 'FAIL'; row.append(cell);
    body.append(row);
  }
  table.append(head, body);
  container.append(headline, metrics, table);
}
