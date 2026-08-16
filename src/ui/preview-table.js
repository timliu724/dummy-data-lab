export const PREVIEW_ROW_LIMIT = 100;

export function previewModel(result, limit = PREVIEW_ROW_LIMIT) {
  return Object.freeze({
    headers: result.headers,
    rows: Object.freeze(result.rows.slice(0, limit)),
    shownRowCount: Math.min(result.rows.length, limit),
    totalRowCount: result.rows.length,
    truncated: result.rows.length > limit,
  });
}

export function renderPreviewTable(container, result) {
  const model = previewModel(result);
  const documentRef = container.ownerDocument;
  const table = documentRef.createElement('table');
  table.className = 'preview-table';
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  model.headers.forEach((header) => {
    const cell = documentRef.createElement('th');
    cell.textContent = header;
    headRow.append(cell);
  });
  head.append(headRow);
  const body = documentRef.createElement('tbody');
  model.rows.forEach((row) => {
    const tableRow = documentRef.createElement('tr');
    row.forEach((value) => {
      const cell = documentRef.createElement('td');
      cell.textContent = value === null || value === undefined ? '' : String(value);
      tableRow.append(cell);
    });
    body.append(tableRow);
  });
  table.append(head, body);
  const note = documentRef.createElement('p');
  note.className = 'preview-note';
  note.textContent = model.truncated
    ? `Showing the first ${model.shownRowCount} of ${model.totalRowCount.toLocaleString()} generated rows.`
    : `Showing all ${model.totalRowCount.toLocaleString()} generated rows.`;
  container.replaceChildren(note, table);
}

function displayValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function inlineComparisonModel({ generationResult, sourcePreview }, limit = PREVIEW_ROW_LIMIT) {
  const sourceRows = new Map(sourcePreview.rows.map((entry) => [entry.sourceRowIndex, entry.row]));
  const sourceColumnIndexes = generationResult.headers.map((header) => sourcePreview.headers.indexOf(header));
  const rows = generationResult.sourcePreviewReferences.slice(0, limit).map((reference) => {
    const sourceRow = reference.sourceRowIndex === null ? null : sourceRows.get(reference.sourceRowIndex) ?? null;
    const outputRow = generationResult.rows[reference.outputRowIndex] ?? [];
    return Object.freeze({
      outputRowIndex: reference.outputRowIndex,
      sourceRowIndex: reference.sourceRowIndex,
      cells: Object.freeze(generationResult.headers.map((header, columnIndex) => {
        const original = sourceRow && sourceColumnIndexes[columnIndex] >= 0
          ? sourceRow[sourceColumnIndexes[columnIndex]]
          : null;
        const current = outputRow[columnIndex] ?? null;
        return Object.freeze({
          header,
          original,
          current,
          changed: reference.sourceRowIndex !== null && displayValue(original) !== displayValue(current),
          synthetic: reference.sourceRowIndex === null,
        });
      })),
    });
  });
  return Object.freeze({ headers: generationResult.headers, rows: Object.freeze(rows), totalRowCount: generationResult.rows.length });
}

export function renderInlineComparisonTable(container, values) {
  const model = inlineComparisonModel(values);
  const documentRef = container.ownerDocument;
  const note = documentRef.createElement('p');
  note.className = 'preview-note preview-note--comparison';
  note.textContent = `Showing ${model.rows.length} generated rows with each current value on top and its source value underneath. Source values stay local and are never included in downloads.`;

  const table = documentRef.createElement('table');
  table.className = 'preview-table preview-table--inline-comparison';
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  model.headers.forEach((label) => {
    const cell = documentRef.createElement('th');
    cell.textContent = label;
    headRow.append(cell);
  });
  head.append(headRow);

  const body = documentRef.createElement('tbody');
  model.rows.forEach((entry) => {
    const row = documentRef.createElement('tr');
    entry.cells.forEach((entryCell) => {
      const cell = documentRef.createElement('td');
      const current = documentRef.createElement('div');
      current.className = entryCell.changed ? 'comparison-current is-changed' : 'comparison-current';
      current.textContent = displayValue(entryCell.current);
      const source = documentRef.createElement('div');
      source.className = 'comparison-source';
      const value = documentRef.createElement('span');
      value.textContent = entryCell.synthetic ? 'No source row' : displayValue(entryCell.original);
      source.append(value);
      cell.append(current, source);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(head, body);
  container.replaceChildren(note, table);
}
