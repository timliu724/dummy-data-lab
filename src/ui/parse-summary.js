function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Pasted text';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function parseSummaryModel(parseResult, columnCount) {
  const headerSummary = parseResult.headerDetection.autoFallback
    ? `${parseResult.headerDetection.decision} — Auto fallback`
    : parseResult.headerDetection.decision === 'ambiguous'
    ? 'Ambiguous — choose Yes or No, then analyse again'
    : `${parseResult.headerDetection.decision} — ${parseResult.headerDetection.confidence}`;
  return Object.freeze([
    ['Source', parseResult.source.name ?? (parseResult.source.kind === 'PASTE' ? 'Excel paste' : 'Text input')],
    ['Size', formatBytes(parseResult.source.sizeBytes)],
    ['Delimiter', parseResult.delimiterDetection.delimiter === '\t' ? 'Tab' : parseResult.delimiterDetection.delimiter],
    ['Delimiter confidence', parseResult.delimiterDetection.confidence],
    ['Input rows', parseResult.rowCount.toLocaleString()],
    ['Columns', columnCount.toLocaleString()],
    ['Header', headerSummary],
    ['Parse issues', parseResult.issues.length.toLocaleString()],
  ]);
}

export function renderParseSummary(container, parseResult, columnCount) {
  const documentRef = container.ownerDocument;
  const fragment = documentRef.createDocumentFragment();
  for (const [label, value] of parseSummaryModel(parseResult, columnCount)) {
    const item = documentRef.createElement('div');
    item.className = 'metric';
    if (label === 'Header' && parseResult.headerDetection.decision === 'ambiguous') item.classList.add('is-warning');
    const term = documentRef.createElement('span');
    term.className = 'metric__label';
    term.textContent = label;
    const detail = documentRef.createElement('strong');
    detail.className = 'metric__value';
    detail.textContent = value;
    item.append(term, detail);
    fragment.append(item);
  }
  container.replaceChildren(fragment);
}
