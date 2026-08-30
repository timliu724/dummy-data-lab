import {
  previewCellModel,
  previewColumnIndexes,
  previewColumnLayout,
} from './preview-layout.js';

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

function placePreview(container, table, note, noteContainer) {
  if (!noteContainer) {
    container.replaceChildren(note, table);
    return;
  }
  noteContainer.className = note.className.replace('preview-note', 'preview-row-note').trim();
  noteContainer.textContent = note.textContent;
  container.replaceChildren(table);
}

function previewValueElement(documentRef, value, header, layout, className = 'preview-cell-value') {
  const model = previewCellModel(value, {
    header,
    characterBudget: layout.characterBudget,
    peerValues: layout.peerValues,
  });
  const element = documentRef.createElement('span');
  element.className = className;
  element.textContent = model.displayValue;
  if (model.truncated) {
    element.classList.add('is-truncated');
    element.title = model.fullValue;
    element.tabIndex = 0;
    element.setAttribute('aria-label', model.fullValue);
    element.dataset.truncation = model.truncation;
  }
  return element;
}

function appendColumnLayout(table, layouts, documentRef) {
  const colgroup = documentRef.createElement('colgroup');
  layouts.forEach((layout) => {
    const column = documentRef.createElement('col');
    column.style.width = layout.width + 'px';
    colgroup.append(column);
  });
  table.style.width = layouts.reduce((total, layout) => total + layout.width, 0) + 'px';
  table.append(colgroup);
}

export function renderPreviewTable(container, result, {
  noteContainer = null,
  excludedColumnIndexes = [],
} = {}) {
  const model = previewModel(result);
  const documentRef = container.ownerDocument;
  const table = documentRef.createElement('table');
  table.className = 'preview-table';
  const indexes = previewColumnIndexes(model.headers, result.rows, { excludedIndexes: excludedColumnIndexes });
  const layouts = previewColumnLayout({ headers: model.headers, rows: result.rows, indexes });
  appendColumnLayout(table, layouts, documentRef);
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  layouts.forEach((layout) => {
    const header = model.headers[layout.index];
    const cell = documentRef.createElement('th');
    cell.append(previewValueElement(documentRef, header, header, layout, 'preview-heading-value'));
    headRow.append(cell);
  });
  head.append(headRow);
  const body = documentRef.createElement('tbody');
  model.rows.forEach((row) => {
    const tableRow = documentRef.createElement('tr');
    layouts.forEach((layout) => {
      const cell = documentRef.createElement('td');
      const value = row[layout.index];
      cell.append(previewValueElement(documentRef, value, model.headers[layout.index], layout));
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
  placePreview(container, table, note, noteContainer);
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

export function renderInlineComparisonTable(container, values, {
  noteContainer = null,
  excludedColumnIndexes = [],
} = {}) {
  const model = inlineComparisonModel(values);
  const documentRef = container.ownerDocument;
  const note = documentRef.createElement('p');
  note.className = 'preview-note preview-note--comparison';
  note.textContent = model.rows.length < model.totalRowCount
    ? `Showing the first ${model.rows.length} of ${model.totalRowCount.toLocaleString()} generated rows.`
    : `Showing all ${model.totalRowCount.toLocaleString()} generated rows.`;

  const table = documentRef.createElement('table');
  table.className = 'preview-table preview-table--inline-comparison';
  const combinedRows = model.rows.flatMap((entry) => [
    entry.cells.map((cell) => displayValue(cell.current)),
    entry.cells.map((cell) => displayValue(cell.original)),
  ]);
  const indexes = previewColumnIndexes(model.headers, combinedRows, { excludedIndexes: excludedColumnIndexes });
  const layouts = previewColumnLayout({ headers: model.headers, rows: combinedRows, indexes });
  appendColumnLayout(table, layouts, documentRef);
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  layouts.forEach((layout) => {
    const label = model.headers[layout.index];
    const cell = documentRef.createElement('th');
    cell.append(previewValueElement(documentRef, label, label, layout, 'preview-heading-value'));
    headRow.append(cell);
  });
  head.append(headRow);

  const body = documentRef.createElement('tbody');
  model.rows.forEach((entry) => {
    const row = documentRef.createElement('tr');
    layouts.forEach((layout) => {
      const entryCell = entry.cells[layout.index];
      const cell = documentRef.createElement('td');
      const current = documentRef.createElement('div');
      current.className = entryCell.changed ? 'comparison-current is-changed' : 'comparison-current';
      current.append(previewValueElement(
        documentRef,
        displayValue(entryCell.current),
        model.headers[layout.index],
        layout,
      ));
      const source = documentRef.createElement('div');
      source.className = 'comparison-source';
      const value = previewValueElement(
        documentRef,
        entryCell.synthetic ? 'No source row' : displayValue(entryCell.original),
        model.headers[layout.index],
        layout,
      );
      source.append(value);
      cell.append(current, source);
      row.append(cell);
    });
    body.append(row);
  });
  table.append(head, body);
  placePreview(container, table, note, noteContainer);
}
