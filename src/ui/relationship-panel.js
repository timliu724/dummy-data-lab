import { createColumnGroup, createShiftGroup } from '../relationships/user-rules.js';

export function setRelationshipEnabled(rules, index, enabled) {
  if (!rules[index]) throw new RangeError('Relationship rule was not found.');
  if (enabled && rules[index].status === 'UNSUPPORTED') {
    throw new RangeError('This relationship is unsupported and cannot be enabled.');
  }
  return Object.freeze(rules.map((rule, ruleIndex) => ruleIndex === index
    ? Object.freeze({
        ...rule,
        status: enabled ? 'CONFIRMED' : (rule.status ?? (rule.source === 'USER' ? 'CONFIRMED' : 'CANDIDATE')),
        confirmed: enabled || rule.status === 'CONFIRMED' || (rule.status === undefined && rule.source === 'USER'),
        enabled: Boolean(enabled),
        reviewRequired: enabled ? false : ['CANDIDATE', 'INFORMATIONAL'].includes(rule.status),
      })
    : rule));
}

export function addShiftGroup(rules, configuration) {
  const rule = createShiftGroup(configuration);
  if (rules.some((existing) => existing.id === rule.id)) throw new RangeError('A relationship with this ID already exists.');
  return Object.freeze([...rules, rule]);
}

export function addMappingGroup(rules, configuration) {
  const rule = createColumnGroup(configuration);
  if (rules.some((existing) => existing.id === rule.id)) throw new RangeError('A relationship with this ID already exists.');
  return Object.freeze([...rules, rule]);
}

export function renderMappingGroupBuilder(container, { headers, policies }, onAdd) {
  const documentRef = container.ownerDocument;
  const details = documentRef.createElement('details');
  details.className = 'shift-group-builder mapping-group-builder';
  const summary = documentRef.createElement('summary');
  summary.textContent = 'Link replacements across columns (optional)';
  const body = documentRef.createElement('div');
  body.className = 'shift-group-builder__body';
  const note = documentRef.createElement('p');
  note.textContent = 'Choose two or more replacement columns. The same source value will receive the same replacement in each.';
  const columns = documentRef.createElement('div');
  columns.className = 'shift-group-columns mapping-group-columns';
  const candidates = headers.map((columnName, index) => ({ columnName, index }))
    .filter(({ index }) => ['REPLACE', 'PATTERN_REPLACE'].includes(policies[index]?.selectedAction));
  if (candidates.length < 2) {
    const empty = documentRef.createElement('small');
    empty.textContent = 'Choose a replacement action for two or more columns first.';
    columns.append(empty);
  } else {
    candidates.forEach(({ columnName }) => {
      const label = documentRef.createElement('label');
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = columnName;
      label.append(checkbox, documentRef.createTextNode(` ${columnName}`));
      columns.append(label);
    });
  }
  const addButton = documentRef.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button';
  addButton.textContent = 'Add enabled mapping group';
  addButton.disabled = candidates.length < 2;
  addButton.addEventListener('click', () => {
    const columnNames = [...columns.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    onAdd({ columnNames });
  });
  body.append(note, columns, addButton);
  details.append(summary, body);
  container.replaceChildren(details);
}

export function renderShiftGroupBuilder(container, { headers, detections }, onAdd) {
  const documentRef = container.ownerDocument;
  const details = documentRef.createElement('details');
  details.className = 'shift-group-builder';
  const summary = documentRef.createElement('summary');
  summary.textContent = 'Shift columns together (optional)';
  const body = documentRef.createElement('div');
  body.className = 'shift-group-builder__body';
  const note = documentRef.createElement('p');
  note.textContent = 'Choose two or more compatible columns. One shared offset keeps their differences intact.';

  const controls = documentRef.createElement('div');
  controls.className = 'shift-group-controls';
  const kindLabel = documentRef.createElement('label');
  kindLabel.textContent = 'Group type';
  const kind = documentRef.createElement('select');
  for (const [value, label] of [
    ['DATE_TIME_DAYS', 'Date / datetime columns'],
    ['TIME_MINUTES', 'Time columns'],
    ['NUMBER_SEQUENCE', 'Number / sequence columns'],
  ]) {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    kind.append(option);
  }
  kindLabel.append(kind);

  const modeLabel = documentRef.createElement('label');
  modeLabel.textContent = 'Offset mode';
  const mode = documentRef.createElement('select');
  for (const [value, label] of [['FIXED', 'Fixed'], ['RANDOM_ONCE', 'Random once per group']]) {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  modeLabel.append(mode);

  const offsetLabel = documentRef.createElement('label');
  offsetLabel.textContent = 'Fixed offset';
  const offset = documentRef.createElement('input');
  offset.type = 'number'; offset.step = '1'; offset.placeholder = '+1 / -7 / +66';
  offsetLabel.append(offset);

  const minimumLabel = documentRef.createElement('label');
  minimumLabel.textContent = 'Random minimum';
  const minimum = documentRef.createElement('input'); minimum.type = 'number'; minimum.step = '1';
  minimumLabel.append(minimum);
  const maximumLabel = documentRef.createElement('label');
  maximumLabel.textContent = 'Random maximum';
  const maximum = documentRef.createElement('input'); maximum.type = 'number'; maximum.step = '1';
  maximumLabel.append(maximum);

  const segmentLabel = documentRef.createElement('label');
  segmentLabel.textContent = 'Numeric segment (1 = first)';
  const segment = documentRef.createElement('input');
  segment.type = 'number'; segment.min = '1'; segment.step = '1'; segment.value = '1';
  segmentLabel.append(segment);
  controls.append(kindLabel, modeLabel, offsetLabel, minimumLabel, maximumLabel, segmentLabel);

  const columns = documentRef.createElement('div');
  columns.className = 'shift-group-columns';
  function candidateIndexes() {
    const accepted = kind.value === 'DATE_TIME_DAYS'
      ? new Set(['DATE', 'DATETIME'])
      : kind.value === 'TIME_MINUTES'
        ? new Set(['TIME'])
        : new Set(['NUMERIC_ID', 'ALPHANUMERIC_CODE', 'INTEGER']);
    return headers.map((_, index) => index).filter((index) => accepted.has(detections[index]?.type));
  }
  function renderColumns() {
    const candidates = candidateIndexes();
    const fragment = documentRef.createDocumentFragment();
    if (candidates.length < 2) {
      const empty = documentRef.createElement('small');
      empty.textContent = 'Fewer than two compatible columns were detected for this group type.';
      fragment.append(empty);
    } else {
      candidates.forEach((index) => {
        const label = documentRef.createElement('label');
        const checkbox = documentRef.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = headers[index];
        label.append(checkbox, documentRef.createTextNode(` ${headers[index]}`));
        fragment.append(label);
      });
    }
    columns.replaceChildren(fragment);
  }
  function updateFields() {
    const random = mode.value === 'RANDOM_ONCE';
    offsetLabel.hidden = random;
    minimumLabel.hidden = !random;
    maximumLabel.hidden = !random;
    segmentLabel.hidden = kind.value !== 'NUMBER_SEQUENCE';
    const dateOnly = kind.value === 'DATE_TIME_DAYS';
    preserveIntervals.checked = true;
    preserveIntervals.disabled = true;
    preserveOrderLabel.hidden = !dateOnly;
    preserveOrder.disabled = !dateOnly;
    if (!dateOnly) preserveOrder.checked = kind.value === 'NUMBER_SEQUENCE';
  }
  kind.addEventListener('change', () => { renderColumns(); updateFields(); });
  mode.addEventListener('change', updateFields);

  const flags = documentRef.createElement('div');
  flags.className = 'shift-group-flags';
  const preserveIntervals = documentRef.createElement('input');
  preserveIntervals.type = 'checkbox'; preserveIntervals.checked = true;
  const preserveIntervalsLabel = documentRef.createElement('label');
  preserveIntervalsLabel.append(preserveIntervals, documentRef.createTextNode(' Preserve intervals (always on for a shared offset)'));
  const preserveOrder = documentRef.createElement('input');
  preserveOrder.type = 'checkbox'; preserveOrder.checked = true;
  const preserveOrderLabel = documentRef.createElement('label');
  preserveOrderLabel.append(preserveOrder, documentRef.createTextNode(' Preserve listed column order'));
  flags.append(preserveIntervalsLabel, preserveOrderLabel);

  const addButton = documentRef.createElement('button');
  addButton.type = 'button'; addButton.className = 'button'; addButton.textContent = 'Add enabled Shift Group';
  addButton.addEventListener('click', () => {
    const selectedColumns = [...columns.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    onAdd({
      shiftKind: kind.value === 'NUMBER_SEQUENCE' ? 'NUMBER_SEQUENCE' : 'DATE_TIME',
      columnNames: selectedColumns,
      offsetMode: mode.value,
      offsetValue: offset.value,
      rangeMinimum: minimum.value,
      rangeMaximum: maximum.value,
      unit: kind.value === 'DATE_TIME_DAYS' ? 'DAYS' : kind.value === 'TIME_MINUTES' ? 'MINUTES' : 'INTEGER',
      segmentIndex: Math.max(0, Number(segment.value) - 1),
      preserveIntervals: preserveIntervals.checked,
      preserveOrder: preserveOrder.checked,
    });
  });
  renderColumns(); updateFields();
  body.append(note, controls, columns, flags, addButton);
  details.append(summary, body);
  container.replaceChildren(details);
}

export function renderRelationshipPanel(container, rules, onToggle) {
  const documentRef = container.ownerDocument;
  if (rules.length === 0) {
    const empty = documentRef.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'No evidence-backed candidates or column-name hints were found. You can continue.';
    container.replaceChildren(empty);
    return;
  }
  const fragment = documentRef.createDocumentFragment();
  rules.forEach((rule, index) => {
    const label = documentRef.createElement('label');
    label.className = 'relationship-card';
    const checkbox = documentRef.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.disabled = rule.status === 'UNSUPPORTED';
    checkbox.setAttribute('aria-label', rule.status === 'CONFIRMED'
      ? `Enable confirmed ${rule.kind} for ${rule.columnNames.join(', ')}`
      : `Confirm and enable ${rule.kind} for ${rule.columnNames.join(', ')}`);
    checkbox.addEventListener('change', () => onToggle(index, checkbox.checked));
    const copy = documentRef.createElement('span');
    const title = documentRef.createElement('strong');
    const kindLabel = rule.kind === 'COLUMN_GROUP' ? 'CONSISTENT_MAPPING' : rule.kind;
    title.textContent = `${kindLabel}: ${rule.columnNames.join(' → ')}`;
    const detail = documentRef.createElement('small');
    const offsetSummary = rule.options?.offsetMode === 'RANDOM_ONCE'
      ? `random once ${rule.options.rangeMinimum} to ${rule.options.rangeMaximum}`
      : rule.options?.offsetValue !== undefined ? `offset ${rule.options.offsetValue} ${rule.options.unit ?? ''}` : null;
    copy.append(title, detail);
    const statusLabel = {
      CANDIDATE: 'Candidate',
      CONFIRMED: 'Confirmed',
      INFORMATIONAL: 'Informational',
      UNSUPPORTED: 'Unsupported',
    }[rule.status] ?? (rule.enabled ? 'Confirmed' : 'Candidate');
    const score = Number.isFinite(rule.confidenceScore)
      ? `${Number((rule.confidenceScore * 100).toFixed(1))}% confidence`
      : `${rule.confidence} confidence`;
    const support = Number.isInteger(rule.support) && rule.support > 0
      ? `${rule.support.toLocaleString()} supporting rows`
      : 'support not measured';
    detail.textContent = `${statusLabel} · ${score} · ${support} · ${rule.enabled ? 'Active' : 'Inactive'}${offsetSummary ? ` · ${offsetSummary}` : ''}`;
    if (rule.evidence?.length > 0) {
      const evidence = documentRef.createElement('small');
      evidence.className = 'relationship-evidence';
      evidence.textContent = rule.evidence[0];
      copy.append(evidence);
    }
    if (rule.status === 'CANDIDATE') {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Evidence-backed candidate. It will not affect generation until you confirm it.';
      copy.append(boundary);
    } else if (rule.status === 'INFORMATIONAL') {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Column-name hint only; no row-level support was measured. Confirm only if you know this rule is real.';
      copy.append(boundary);
    } else if (rule.status === 'UNSUPPORTED') {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Shown for transparency; this rule cannot control generation.';
      copy.append(boundary);
    } else if (rule.status === 'CONFIRMED' && !['DATE_TIME_SHIFT_GROUP', 'NUMBER_SEQUENCE_SHIFT_GROUP', 'COLUMN_GROUP'].includes(rule.kind)) {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Confirmed by you. When active, this relationship is generated and validated as a contract.';
      copy.append(boundary);
    }
    if (['DATE_TIME_SHIFT_GROUP', 'NUMBER_SEQUENCE_SHIFT_GROUP'].includes(rule.kind)) {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Turning this off disables only the shared rule; Final Actions stay unchanged.';
      copy.append(boundary);
    } else if (rule.kind === 'COLUMN_GROUP') {
      const boundary = documentRef.createElement('small');
      boundary.className = 'relationship-boundary';
      boundary.textContent = 'Turning this off disables only the shared rule; Final Actions stay unchanged.';
      copy.append(boundary);
    }
    label.append(checkbox, copy);
    fragment.append(label);
  });
  container.replaceChildren(fragment);
}
