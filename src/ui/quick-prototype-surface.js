import quickPrototypeHtml from '../../prototypes/quick-mode/quick-mode-prototype.html';
import { TRANSFORM_SAMPLE, isTransformSampleText } from '../examples/transform-sample.js';

const STEP_ORDER = Object.freeze(['choose', 'review', 'download']);
const TITLE_BY_STEP = Object.freeze({
  choose: 'Make useful test data',
  review: 'Review each column',
  download: 'Your test data is ready',
});
const ACTION_LABELS = Object.freeze({
  KEEP: 'Keep source values',
  REPLACE: 'Create fictional values',
  PATTERN_REPLACE: 'Regenerate the same format',
  SHIFT: 'Shift by a fixed amount',
  RESAMPLE: 'Reuse valid choices or ranges',
  GENERALISE: 'Reduce the level of detail',
  TEXT_SANITISE: 'Sanitise text',
  CLEAR: 'Clear values',
  DROP: 'Drop column',
  GENERATE: 'Generate',
});
const TRANSFORM_ACTIONS = Object.freeze([
  'KEEP', 'REPLACE', 'PATTERN_REPLACE', 'SHIFT', 'RESAMPLE',
  'GENERALISE', 'TEXT_SANITISE', 'CLEAR', 'DROP',
]);
const EXTRA_CSS = [
  ':host { display: block; min-width: 320px; min-height: 100vh; color: var(--ink); background: var(--canvas); }',
  '.quick-root { min-height: 100vh; }',
  '.skip-link { position: fixed; z-index: 100; left: 18px; top: 10px; transform: translateY(-150%); padding: 9px 12px; border: 1px solid var(--ink); border-radius: 6px; background: var(--surface); color: var(--ink); font-weight: 800; }',
  '.skip-link:focus { transform: translateY(0); }',
  '.advanced-notice[data-kind="error"] { border-color: #e1a08c; background: var(--orange-soft); color: var(--orange-dark); }',
  '.advanced-notice[data-kind="success"] { border-color: #87bbb6; background: var(--teal-soft); color: var(--teal-dark); }',
  '.column-parameter { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(160px, 220px); gap: 16px; align-items: center; width: 100%; padding-top: 12px; border-top: 1px solid var(--line); }',
  '.column-parameter span { display: grid; gap: 3px; }',
  '.column-parameter small { color: var(--muted); }',
  '.column-parameter input, .column-parameter select { width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); }',
  '.action-chooser { min-width: 210px; }',
  '.action-chooser summary { cursor: pointer; color: var(--teal-dark); font-weight: 800; text-align: right; }',
  '.action-chooser select { width: 100%; margin-top: 9px; }',
  '.journey-header h1[tabindex="-1"]:focus { outline: none; }',
  '.readiness[data-blocked="true"] { border-color: #e1a08c; background: var(--orange-soft); color: var(--orange-dark); }',
  '.quick-root [aria-busy="true"] { cursor: wait; }',
  '.quick-root button[aria-busy="true"]::after { content: ""; display: inline-block; width: .78em; height: .78em; margin-left: .6em; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; vertical-align: -.08em; animation: quick-busy-spin .7s linear infinite; }',
  '@keyframes quick-busy-spin { to { transform: rotate(360deg); } }',
  '.generation-variation { margin: 12px 0 0; color: var(--muted); font-size: .82rem; line-height: 1.45; }',
  '.generation-variation[data-kind="repeatable"] { color: var(--orange-dark); }',
  '.setting-list, .setting-row, .setting-row select { font-family: var(--font-ui); }',
  '.column-inline-preview__source, .column-inline-preview__result, .preview-table th, .preview-table td, .review-summary strong, .result-summary strong, .setting-row dd, .step-number, .preview-caption { font-family: var(--font-numeric); font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "onum" 0, "lnum" 1, "tnum" 1; }',
  '.result-summary strong { font: 800 2rem/1 var(--font-ui); }',
  '@media (max-width: 720px) { .column-parameter { grid-template-columns: 1fr; } }',
  '@media (prefers-reduced-motion: reduce) { .quick-root button[aria-busy="true"]::after { animation: none; border-top-color: currentColor; opacity: .55; } }',
].join('\n');

function prototypeSurface(documentRef) {
  const parsed = new DOMParser().parseFromString(quickPrototypeHtml, 'text/html');
  parsed.querySelectorAll('script, .prototype-note').forEach((element) => element.remove());
  const sourceStyle = parsed.querySelector('style')?.textContent ?? '';
  const scopedStyle = sourceStyle
    .replace(/:root\s*\{/, ':host {')
    .replace(/(^|\n)\s*html\s*\{/, '$1:host {')
    .replace(/(^|\n)\s*body\s*\{/, '$1.quick-root {');
  const style = documentRef.createElement('style');
  style.textContent = scopedStyle + '\n' + EXTRA_CSS;
  const root = documentRef.createElement('div');
  root.className = 'quick-root';
  while (parsed.body.firstChild) root.append(parsed.body.firstChild);
  return { style, root };
}
function labelForAction(action) {
  return ACTION_LABELS[action] ?? String(action ?? '').replaceAll('_', ' ').toLocaleLowerCase();
}
function textElement(documentRef, tag, text, className = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}
function uniqueActions(column) {
  const preferred = column.task === 'scratch' ? ['GENERATE', 'DROP'] : TRANSFORM_ACTIONS;
  return [...new Set([column.selectedAction, column.recommendedAction, ...preferred].filter(Boolean))];
}

export function mountQuickPrototypeSurface(host, handlers) {
  if (!host) throw new TypeError('Quick surface host is required.');
  if (host.shadowRoot) return host.__quickController;
  const documentRef = host.ownerDocument;
  const shadow = host.attachShadow({ mode: 'open' });
  const surface = prototypeSurface(documentRef);
  shadow.replaceChildren(surface.style, surface.root);
  const root = surface.root;
  const view = {
    step: 'choose', task: 'transform', filter: 'all',
    search: '', page: 0, pageSize: 6, openColumn: -1,
    hiddenColumns: new Set(), snapshot: null, file: null, sourcePreference: null,
    selectedTemplates: new Set(['people']),
    templateSelections: new Map(), customColumns: [], customColumnSequence: 0,
  };
  const query = (selector) => root.querySelector(selector);
  const queryAll = (selector) => [...root.querySelectorAll(selector)];
  const fileInput = query('#source-file');
  const pasteInput = query('#paste-input');
  const skipLink = textElement(documentRef, 'a', 'Skip to Quick workspace', 'skip-link');
  skipLink.href = '#quick-main';
  root.prepend(skipLink);
  query('.app-shell')?.setAttribute('id', 'quick-main');
  query('.workbench-heading small').textContent = 'Analysed locally in this browser.';
  query('#file-help').textContent = 'Choose a local file. Its contents are never uploaded.';
  pasteInput.placeholder = 'Paste cells from Excel or another spreadsheet…';
  query('#download-button').textContent = 'Download CSV';
  query('.brand').setAttribute('aria-label', 'Dummy Data Lab Quick home');
  const regenerateButton = textElement(documentRef, 'button', 'Generate another version', 'button');
  regenerateButton.id = 'regenerate-button';
  regenerateButton.type = 'button';
  query('.result-secondary-actions').prepend(regenerateButton);
  const reviewVariation = textElement(documentRef, 'p', '', 'generation-variation');
  reviewVariation.id = 'review-variation';
  query('#readiness').after(reviewVariation);
  const resultVariation = textElement(documentRef, 'p', '', 'generation-variation');
  resultVariation.id = 'result-variation';
  query('#sidebar-download .boundary-note').before(resultVariation);

  function showNotice(message, kind = 'info') {
    const notice = query('#advanced-notice');
    notice.dataset.kind = kind;
    notice.querySelector('span').textContent = message;
    notice.hidden = false;
  }
  function hideNotice() { query('#advanced-notice').hidden = true; }
  function setSourceStatus(title, detail = '', kind = 'info') {
    const status = query('#source-status');
    status.dataset.kind = kind;
    status.replaceChildren(textElement(documentRef, 'strong', title));
    if (detail) status.append(documentRef.createTextNode(' · ' + detail));
    status.hidden = false;
  }
  function currentSourceKind() {
    const hasFile = Boolean(view.file);
    const hasPaste = pasteInput.value.trim() !== '';
    const sample = isTransformSampleText(pasteInput.value);
    if (hasFile && hasPaste && !sample && !['FILE', 'PASTE'].includes(view.sourcePreference)) return 'CONFLICT';
    if (hasFile && (sample || view.sourcePreference === 'FILE')) return 'FILE';
    if (hasPaste && (sample || ['PASTE', 'SAMPLE'].includes(view.sourcePreference))) return sample ? 'SAMPLE' : 'PASTE';
    if (hasFile) return 'FILE';
    if (hasPaste) return 'PASTE';
    return 'NONE';
  }
  function renderSourceState() {
    const kind = currentSourceKind();
    const sample = isTransformSampleText(pasteInput.value);
    const conflict = query('#source-conflict');
    conflict.hidden = kind !== 'CONFLICT';
    query('#use-file-source').textContent = view.file ? 'Use ' + view.file.name : 'Use uploaded file';
    query('.paste-zone').dataset.source = sample ? 'sample' : '';
    if (kind === 'CONFLICT') {
      query('#source-status').hidden = true;
      return kind;
    }
    if (kind === 'FILE') {
      setSourceStatus('Using ' + (view.file?.name ?? 'uploaded file'), sample ? 'Sample data is not used' : 'Ready to analyse locally');
    } else if (kind === 'SAMPLE') {
      setSourceStatus('Sample loaded', `${TRANSFORM_SAMPLE.name} · ${TRANSFORM_SAMPLE.columnCount} columns · ${TRANSFORM_SAMPLE.rowCount} rows`);
    } else if (kind === 'PASTE') {
      setSourceStatus('Using pasted data', 'Ready to analyse locally');
    } else {
      query('#source-status').hidden = true;
    }
    return kind;
  }
  function acceptFile(file) {
    view.file = file ?? null;
    if (!view.file) {
      renderSourceState();
      return;
    }
    query('#file-label').textContent = view.file.name;
    query('#file-help').textContent = 'Ready to analyse locally. File contents stay in this browser.';
    const hasUserPaste = pasteInput.value.trim() !== '' && !isTransformSampleText(pasteInput.value);
    view.sourcePreference = hasUserPaste ? null : 'FILE';
    renderSourceState();
  }
  function loadSampleData() {
    const hasUserPaste = pasteInput.value.trim() !== '' && !isTransformSampleText(pasteInput.value);
    if ((view.file || hasUserPaste)
      && !globalThis.confirm('Replace the current input choice with the fictional retail-orders sample?')) return;
    view.file = null;
    fileInput.value = '';
    query('#file-label').textContent = 'Drop a CSV, TSV, or TXT file here';
    query('#file-help').textContent = 'Choose a local file. Its contents are never uploaded.';
    pasteInput.value = TRANSFORM_SAMPLE.text;
    pasteInput.scrollTop = 0;
    view.sourcePreference = 'SAMPLE';
    renderSourceState();
    pasteInput.focus();
    pasteInput.setSelectionRange(0, 0);
  }
  function updateTaskButtons() {
    queryAll('.task-card').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.task === view.task));
    });
    query('#transform-workbench').hidden = view.task !== 'transform';
    query('#scratch-workbench').hidden = view.task !== 'scratch';
  }
  function templateFieldDefinitions(templateId) {
    return (handlers.templateFields?.(templateId) ?? []).map((field) => typeof field === 'string'
      ? { name: field, generatorType: 'category' }
      : field);
  }
  function selectionForTemplate(templateId) {
    if (!view.templateSelections.has(templateId)) {
      view.templateSelections.set(
        templateId,
        new Set(templateFieldDefinitions(templateId).map((field) => field.name)),
      );
    }
    return view.templateSelections.get(templateId);
  }
  function selectedTemplateIds() {
    return queryAll('.template-button')
      .map((button) => button.dataset.template)
      .filter((templateId) => view.selectedTemplates.has(templateId));
  }
  function updateTemplateButtons() {
    queryAll('.template-button').forEach((button) => {
      button.setAttribute('aria-pressed', String(view.selectedTemplates.has(button.dataset.template)));
    });
  }
  function scratchDraft() {
    const selected = selectedTemplateIds();
    return Object.freeze({
      templateId: selected[0] ?? 'blank',
      templates: Object.freeze(selected.map((templateId) => Object.freeze({
        templateId,
        enabledFields: Object.freeze([...selectionForTemplate(templateId)]),
      }))),
      customColumns: Object.freeze(view.customColumns.map((column) => Object.freeze({
        name: column.name.trim(),
        generatorType: column.generatorType,
      }))),
    });
  }
  function updateScratchFieldCount() {
    const selectedCount = selectedTemplateIds()
      .reduce((total, templateId) => total + selectionForTemplate(templateId).size, 0)
      + view.customColumns.length;
    query('#selected-field-count').textContent = String(selectedCount);
    query('#scratch-review-button').disabled = selectedCount === 0;
  }
  function renderTemplateFields() {
    const target = query('#field-preview');
    target.replaceChildren();
    selectedTemplateIds().forEach((templateId) => {
      const selected = selectionForTemplate(templateId);
      const fields = templateFieldDefinitions(templateId);
      const group = documentRef.createElement('section');
      group.className = 'template-field-group';
      group.dataset.templateId = templateId;
      const sourceButton = query(`.template-button[data-template="${templateId}"]`);
      const heading = documentRef.createElement('div');
      heading.className = 'template-field-group__heading';
      heading.append(
        textElement(documentRef, 'strong', sourceButton?.querySelector('strong')?.textContent ?? templateId),
        textElement(documentRef, 'small', `${selected.size} of ${fields.length} included`),
      );
      const controls = documentRef.createElement('div');
      controls.className = 'template-field-group__fields';
      fields.forEach((field) => {
        const control = textElement(documentRef, 'button', field.name, 'field-chip');
        control.type = 'button';
        control.dataset.fieldName = field.name;
        control.dataset.templateId = templateId;
        control.setAttribute('aria-pressed', String(selected.has(field.name)));
        control.title = selected.has(field.name)
          ? 'Included. Click to omit this field.'
          : 'Omitted. Click to include this field.';
        control.addEventListener('click', () => {
          if (selected.has(field.name)) selected.delete(field.name);
          else selected.add(field.name);
          renderTemplateFields();
        });
        controls.append(control);
      });
      group.append(heading, controls);
      target.append(group);
    });
    updateScratchFieldCount();
  }
  function renderCustomColumns() {
    const target = query('#custom-column-list');
    const types = handlers.customColumnTypes?.() ?? [];
    target.replaceChildren();
    view.customColumns.forEach((column) => {
      const row = documentRef.createElement('div');
      row.className = 'custom-column-row';
      const name = documentRef.createElement('input');
      name.type = 'text';
      name.value = column.name;
      name.name = 'custom_column_name_' + column.id;
      name.autocomplete = 'off';
      name.setAttribute('aria-label', 'Custom column name');
      name.addEventListener('input', () => { column.name = name.value; });
      const type = documentRef.createElement('select');
      type.name = 'custom_column_type_' + column.id;
      type.setAttribute('aria-label', 'Custom column type for ' + column.name);
      types.forEach((entry) => {
        const option = documentRef.createElement('option');
        option.value = entry.id;
        option.textContent = entry.label;
        option.selected = entry.id === column.generatorType;
        type.append(option);
      });
      type.addEventListener('change', () => { column.generatorType = type.value; });
      const remove = textElement(documentRef, 'button', 'Remove', 'custom-column-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove custom column ' + column.name);
      remove.addEventListener('click', () => {
        view.customColumns = view.customColumns.filter((entry) => entry.id !== column.id);
        renderCustomColumns();
      });
      row.append(name, type, remove);
      target.append(row);
    });
    target.hidden = view.customColumns.length === 0;
    updateScratchFieldCount();
  }
  function setStep(step) {
    if (!STEP_ORDER.includes(step)) return;
    const previousStep = view.step;
    view.step = step;
    query('#page-title').textContent = TITLE_BY_STEP[step];
    queryAll('[data-step-panel]').forEach((panel) => { panel.hidden = panel.dataset.stepPanel !== step; });
    STEP_ORDER.forEach((name) => { query('#sidebar-' + name).hidden = name !== step; });
    const activeIndex = STEP_ORDER.indexOf(step);
    queryAll('.step-button').forEach((button, index) => {
      button.removeAttribute('aria-current');
      button.classList.toggle('is-complete', index < activeIndex);
      button.classList.toggle('is-available', index <= activeIndex);
      button.disabled = index > activeIndex;
      button.querySelector('.step-number').textContent = index < activeIndex ? 'OK' : String(index + 1);
      if (index === activeIndex) button.setAttribute('aria-current', 'step');
    });
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    host.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    if (step === 'review') renderReview(false);
    if (step === 'download') { renderPreview(); queueMicrotask(updateVisibleRange); }
    if (step !== previousStep) {
      queueMicrotask(() => {
        const title = query('#page-title');
        title.setAttribute('tabindex', '-1');
        title.focus({ preventScroll: true });
      });
    }
  }
  async function runBusy(button, label, task) {
    const original = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = label;
    hideNotice();
    try { return await task(); }
    catch (error) {
      showNotice(error?.message ?? 'This action could not be completed.', 'error');
      return null;
    } finally {
      button.textContent = original;
      button.removeAttribute('aria-busy');
      button.disabled = false;
    }
  }
  function filteredColumns() {
    const columns = view.snapshot?.columns ?? [];
    const needle = view.search.trim().toLocaleLowerCase();
    return columns.map((column, index) => ({ column, index })).filter(({ column }) => {
      const matchesFilter = view.filter === 'all' || column.reviewRequired;
      const matchesSearch = !needle || [column.name, column.detectedType, column.selectedAction, column.reason]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    });
  }
  function reviewCount() {
    return (view.snapshot?.columns ?? []).filter((column) => column.reviewRequired).length;
  }
  function updateReadiness() {
    const count = reviewCount();
    const blocker = view.snapshot?.blockers?.[0] ?? null;
    const generateButton = query('#generate-button');
    const readiness = query('#readiness');
    generateButton.disabled = Boolean(blocker);
    readiness.dataset.blocked = String(Boolean(blocker));
    if (blocker) {
      readiness.querySelector('strong').textContent = blocker.title;
      readiness.querySelector('small').textContent = blocker.recovery;
    } else if (count > 0) {
      readiness.querySelector('strong').textContent = 'Ready to generate';
      readiness.querySelector('small').textContent = count + ' suggested review' + (count === 1 ? ' is' : 's are')
        + ' highlighted. Generation is ready.';
    } else {
      readiness.querySelector('strong').textContent = 'Ready to generate';
      readiness.querySelector('small').textContent = 'Your Quick choices are complete.';
    }
    const variation = view.snapshot?.variation;
    reviewVariation.hidden = !variation?.text;
    reviewVariation.dataset.kind = variation?.kind ?? '';
    reviewVariation.textContent = variation?.text ?? '';
  }
  function renderReviewSummary(resetView = false) {
    const columns = view.snapshot?.columns ?? [];
    const count = reviewCount();
    if (resetView) {
      view.page = 0; view.filter = 'all'; view.search = '';
      view.openColumn = columns.findIndex((column) => column.reviewRequired);
      query('#column-search').value = '';
    }
    query('#review-total').textContent = String(columns.length);
    query('#quick-review-column-count').textContent = String(columns.length);
    query('#review-ready').textContent = String(columns.length - count);
    query('#review-needed').textContent = String(count);
    queryAll('[data-filter]').forEach((button) => {
      const all = button.dataset.filter === 'all';
      button.setAttribute('aria-pressed', String(button.dataset.filter === view.filter));
      button.textContent = all ? 'All ' + columns.length : 'Suggested review ' + count;
    });
    query('#review-confirmation-line').hidden = count === 0;
    query('#review-confirmation-label').textContent = count === 1
      ? '1 suggested review is highlighted. Generation is ready.'
      : count + ' suggested reviews are highlighted. Generation is ready.';
    const rowCount = String(view.snapshot?.requestedRowCount ?? 200);
    if ([...query('#quick-row-count').options].some((option) => option.value === rowCount)) {
      query('#quick-row-count').value = rowCount;
    }
    updateReadiness();
  }
  function addShiftControls(details, column, index) {
    if (column.selectedAction !== 'SHIFT') return;
    const detectedType = column.detectedTypeKey ?? column.detectedType;
    const parameter = documentRef.createElement('label');
    parameter.className = 'column-parameter';
    const copy = documentRef.createElement('span');
    const shiftCopy = column.shiftKind === 'NUMBER_SEQUENCE'
      ? ['Whole-number offset', 'Quick starts at +6.']
      : detectedType === 'TIME'
        ? ['Time offset', 'Quick starts at +6 hours.']
        : detectedType === 'DATETIME'
          ? ['Date and time offset', 'Quick starts at +150 hours (6 days + 6 hours).']
          : ['Date offset', 'Quick starts at +6 days.'];
    copy.append(
      textElement(documentRef, 'strong', shiftCopy[0]),
      textElement(documentRef, 'small', shiftCopy[1]),
    );
    const input = documentRef.createElement('input');
    input.type = 'number'; input.step = '1';
    input.value = column.actionParams?.offsetValue ?? '';
    input.placeholder = '6';
    input.setAttribute('aria-label', 'Fixed offset for ' + column.name);
    input.addEventListener('change', async () => {
      const next = await handlers.changeColumnParams?.(index, { offsetMode: 'FIXED', offsetValue: input.value });
      if (next) { view.snapshot = next; renderReview(false); }
    });
    parameter.append(copy, input);
    details.append(parameter);
    if (detectedType === 'AMBIGUOUS_DATE') {
      const orientationLabel = documentRef.createElement('label');
      orientationLabel.className = 'column-parameter';
      const orientationCopy = documentRef.createElement('span');
      orientationCopy.append(
        textElement(documentRef, 'strong', 'Date order'),
        textElement(documentRef, 'small', 'Choose how values such as 03/04/2026 should be read.'),
      );
      const orientation = documentRef.createElement('select');
      [['', 'Choose date order'], ['DMY', 'DD/MM/YYYY'], ['MDY', 'MM/DD/YYYY']].forEach(([value, label]) => {
        const option = documentRef.createElement('option');
        option.value = value; option.textContent = label;
        option.selected = value === (column.actionParams?.dateOrientation ?? '');
        orientation.append(option);
      });
      orientation.addEventListener('change', async () => {
        const next = await handlers.changeColumnParams?.(index, { dateOrientation: orientation.value || null });
        if (next) { view.snapshot = next; renderReview(false); }
      });
      orientationLabel.append(orientationCopy, orientation);
      details.append(orientationLabel);
    }
  }
  function renderColumnList() {
    const list = query('#column-list');
    const filtered = filteredColumns();
    const reviewPreviewByIndex = new Map(
      (view.snapshot?.reviewPreview ?? []).map((item) => [item.columnIndex, item]),
    );
    const maxPage = Math.max(0, Math.ceil(filtered.length / view.pageSize) - 1);
    view.page = Math.min(Math.max(0, view.page), maxPage);
    const start = view.page * view.pageSize;
    const pageItems = filtered.slice(start, start + view.pageSize);
    list.replaceChildren();
    pageItems.forEach(({ column, index }) => {
      const row = documentRef.createElement('article');
      row.className = 'column-row' + (view.openColumn === index ? ' is-open' : '');
      const button = documentRef.createElement('button');
      button.type = 'button'; button.className = 'column-main';
      button.dataset.columnIndex = String(index);
      button.setAttribute('aria-expanded', String(view.openColumn === index));
      const name = documentRef.createElement('span');
      name.className = 'column-name';      name.append(textElement(documentRef, 'strong', column.name), textElement(documentRef, 'small', column.detectedType));
      const preview = reviewPreviewByIndex.get(index);
      const inlinePreview = documentRef.createElement('span');
      inlinePreview.className = 'column-inline-preview'
        + (view.snapshot?.task === 'scratch' ? ' column-inline-preview--scratch' : '')
        + (!preview?.available ? ' is-unavailable' : '');
      if (view.snapshot?.task !== 'scratch') {
        const source = textElement(documentRef, 'span', preview?.source ?? '(no sample)', 'column-inline-preview__source');
        source.title = preview?.source ?? 'No source sample is available.';
        inlinePreview.append(source, textElement(documentRef, 'span', '→', 'column-inline-preview__arrow'));
      }
      const result = textElement(
        documentRef,
        'strong',
        preview?.result ?? '(preview unavailable)',
        'column-inline-preview__result',
      );
      result.title = preview?.result ?? 'Preview unavailable.';
      inlinePreview.append(result);
      button.append(
        name,
        textElement(documentRef, 'span', labelForAction(column.selectedAction), 'action-name'),
        inlinePreview,
        textElement(documentRef, 'span', column.reviewRequired ? 'Review' : 'Ready', 'status status--' + (column.reviewRequired ? 'review' : 'ready')),
        textElement(documentRef, 'span', '', 'chevron'),
      );
      button.lastElementChild.setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => {
        view.openColumn = view.openColumn === index ? -1 : index;
        renderColumnList();
        query('.column-main[data-column-index="' + index + '"]')?.focus();
      });
      row.append(button);
      if (view.openColumn === index) {
        const details = documentRef.createElement('div');
        details.className = 'column-details';
        const copy = documentRef.createElement('p');
        copy.append(
          textElement(documentRef, 'strong', column.reviewRequired ? 'Review this recommendation' : 'Recommendation ready'),
          textElement(documentRef, 'small', column.reason || (column.reviewRequired
            ? 'Quick found a pattern that deserves a human check before generation.'
            : 'The production recommendation is ready. Change it only when your test needs differ.')),
        );
        const actionChooser = documentRef.createElement('details');
        actionChooser.className = 'action-chooser';
        actionChooser.append(textElement(documentRef, 'summary', 'Change action'));
        const select = documentRef.createElement('select');
        select.dataset.columnIndex = String(index);
        select.setAttribute('aria-label', 'Action for ' + column.name);
        uniqueActions(column).forEach((action) => {
          const option = documentRef.createElement('option');
          option.value = action; option.textContent = labelForAction(action);
          option.selected = action === column.selectedAction;
          select.append(option);
        });
        select.addEventListener('change', async () => {
          const next = await handlers.changeColumnAction?.(index, select.value);
          if (next) {
            view.snapshot = next; view.openColumn = index;
            renderReview(false);
            query('.column-main[data-column-index="' + index + '"]')?.focus();
          }
        });
        actionChooser.append(select);
        details.append(copy, actionChooser);
        addShiftControls(details, column, index);
        row.append(details);
      }
      list.append(row);
    });
    const end = Math.min(start + pageItems.length, filtered.length);
    query('#page-summary').textContent = filtered.length
      ? 'Showing columns ' + (start + 1) + '-' + end + ' of ' + filtered.length
      : 'No columns match';
    query('#previous-page').disabled = view.page === 0;
    query('#next-page').disabled = view.page >= maxPage;
  }
  function renderReview(resetView = false) { renderReviewSummary(resetView); renderColumnList(); }
  function visibleColumnIndexes() {
    const headers = view.snapshot?.result?.headers ?? [];
    return headers.map((_, index) => index).filter((index) => !view.hiddenColumns.has(index));
  }
  function renderColumnChooser() {
    const chooser = query('#column-chooser');
    chooser.replaceChildren();
    const headers = view.snapshot?.result?.headers ?? [];
    const needle = query('#column-choice-search').value.trim().toLocaleLowerCase();
    headers.forEach((header, index) => {
      if (needle && !String(header).toLocaleLowerCase().includes(needle)) return;
      const label = documentRef.createElement('label');
      const input = documentRef.createElement('input');
      input.type = 'checkbox'; input.checked = !view.hiddenColumns.has(index);
      input.dataset.columnIndex = String(index);
      input.addEventListener('change', () => {
        if (input.checked) view.hiddenColumns.delete(index); else view.hiddenColumns.add(index);
        renderPreview();
      });
      label.append(input, documentRef.createTextNode(' ' + header));
      chooser.append(label);
    });
  }
  function updateVisibleRange() {
    const wrap = query('#preview-table-wrap');
    const headers = queryAll('#preview-table th');
    const visibleIndexes = visibleColumnIndexes();
    if (!headers.length || !visibleIndexes.length) {
      query('#visible-range').textContent = 'No visible columns';
      return;
    }
    const left = wrap.scrollLeft;
    const right = left + wrap.clientWidth;
    const visible = headers.map((cell, position) => ({ cell, sourceIndex: visibleIndexes[position] }))
      .filter(({ cell }) => cell.offsetLeft + cell.offsetWidth > left && cell.offsetLeft < right);
    const first = (visible[0]?.sourceIndex ?? visibleIndexes[0]) + 1;
    const last = (visible.at(-1)?.sourceIndex ?? visibleIndexes.at(-1)) + 1;
    query('#visible-range').textContent = 'Columns ' + first + '-' + last + ' of ' + (view.snapshot?.result?.headers.length ?? 0);
  }
  function renderQuality() {
    const result = view.snapshot?.result;
    const valid = result?.validationValid === true;
    const qualityStatus = query('.quality-status');
    qualityStatus.querySelector('.quality-mark').textContent = valid ? 'OK' : '!';
    qualityStatus.querySelector('strong').textContent = valid ? 'Output checks passed' : 'Check the output';
    qualityStatus.querySelector('small').textContent = valid ? 'Structure, row count, and values' : 'One or more checks need attention';
    const reviewItem = query('#quality-review-item');
    const warnings = result?.warnings ?? [];
    reviewItem.hidden = warnings.length === 0;
    if (warnings.length) {
      reviewItem.querySelector('strong').textContent = 'SUGGESTED REVIEW — ' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's');
      reviewItem.querySelector('p').textContent = warnings.slice(0, 2).join(' ');
    }
    const variation = view.snapshot?.variation;
    resultVariation.hidden = !variation?.text;
    resultVariation.dataset.kind = variation?.kind ?? '';
    resultVariation.textContent = variation?.text ?? '';
  }
  function renderPreview() {
    const result = view.snapshot?.result;
    if (!result) return;
    const indexes = visibleColumnIndexes();
    const table = query('#preview-table');
    table.classList.add('is-content-fit');
    table.style.width = '';
    table.replaceChildren();
    const previewRows = result.rows.slice(0, 12);
    const colgroup = documentRef.createElement('colgroup');
    const displayUnits = (value) => [...String(value ?? '')]
      .reduce((total, character) => total + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1), 0);
    const widths = indexes.map((index) => {
      const longest = Math.max(
        displayUnits(result.headers[index]),
        ...previewRows.map((row) => displayUnits(row[index])),
      );
      return Math.max(88, Math.min(176, Math.round((longest * 7.2) + 24)));
    });
    widths.forEach((width) => {
      const column = documentRef.createElement('col');
      column.style.width = width + 'px';
      colgroup.append(column);
    });
    table.style.width = widths.reduce((total, width) => total + width, 0) + 'px';
    const head = documentRef.createElement('thead');
    const headRow = documentRef.createElement('tr');
    indexes.forEach((index) => headRow.append(textElement(documentRef, 'th', result.headers[index])));
    head.append(headRow);
    const body = documentRef.createElement('tbody');
    previewRows.forEach((rowData) => {
      const row = documentRef.createElement('tr');
      indexes.forEach((index) => row.append(textElement(documentRef, 'td', String(rowData[index] ?? ''))));
      body.append(row);
    });
    table.append(colgroup, head, body);
    query('#result-row-count').textContent = String(result.rows.length);
    query('#result-column-count').textContent = String(result.headers.length);
    query('#columns-button').textContent = 'Columns ' + indexes.length;
    query('.preview-caption span').textContent = 'Showing ' + Math.min(12, result.rows.length) + ' of ' + result.rows.length + ' rows';
    query('#preview-scroll-hint').textContent = result.headers.length > 6
      ? 'Scroll horizontally to view more columns.' : 'Every generated column is shown.';
    renderColumnChooser();
    renderQuality();
    queueMicrotask(updateVisibleRange);
  }
  function applySnapshot(snapshot, resetView = false) {
    view.snapshot = snapshot;
    if (!snapshot) return;
    view.task = snapshot.task;
    updateTaskButtons();
    if (view.step === 'review') renderReview(resetView);
    if (view.step === 'download') renderPreview();
  }

  queryAll('.step-button').forEach((button) => {
    button.addEventListener('click', () => { if (!button.disabled) setStep(button.dataset.step); });
  });
  queryAll('.task-card').forEach((button) => {
    button.addEventListener('click', () => {
      view.task = button.dataset.task; updateTaskButtons(); handlers.taskChanged?.(view.task);
    });
  });
  queryAll('.template-button').forEach((button) => {
    button.addEventListener('click', () => {
      const templateId = button.dataset.template;
      if (view.selectedTemplates.has(templateId)) view.selectedTemplates.delete(templateId);
      else {
        view.selectedTemplates.add(templateId);
        selectionForTemplate(templateId);
      }
      updateTemplateButtons();
      renderTemplateFields();
    });
  });
  query('#add-custom-column').addEventListener('click', () => {
    view.customColumnSequence += 1;
    view.customColumns.push({
      id: view.customColumnSequence,
      name: 'custom_column_' + view.customColumnSequence,
      generatorType: 'category',
    });
    renderCustomColumns();
    query('#custom-column-list .custom-column-row:last-child input')?.select();
  });
  const fileDrop = query('#file-drop');
  fileInput.addEventListener('change', () => {
    acceptFile(fileInput.files?.[0] ?? null);
  });
  ['dragenter', 'dragover'].forEach((type) => fileDrop.addEventListener(type, (event) => {
    event.preventDefault(); fileDrop.classList.add('is-dragging');
  }));
  fileDrop.addEventListener('dragleave', (event) => {
    event.preventDefault(); fileDrop.classList.remove('is-dragging');
  });
  fileDrop.addEventListener('drop', (event) => {
    event.preventDefault(); fileDrop.classList.remove('is-dragging');
    acceptFile(event.dataTransfer?.files?.[0] ?? null);
  });
  pasteInput.addEventListener('input', () => {
    const hasPaste = pasteInput.value.trim() !== '';
    const sample = isTransformSampleText(pasteInput.value);
    if (!hasPaste) view.sourcePreference = view.file ? 'FILE' : null;
    else if (sample) view.sourcePreference = view.file ? 'FILE' : 'SAMPLE';
    else if (!view.file || view.sourcePreference === 'PASTE') view.sourcePreference = 'PASTE';
    else view.sourcePreference = null;
    renderSourceState();
  });
  query('#sample-data-button').addEventListener('click', loadSampleData);
  query('#use-file-source').addEventListener('click', () => {
    view.sourcePreference = 'FILE';
    renderSourceState();
  });
  query('#use-paste-source').addEventListener('click', () => {
    view.sourcePreference = 'PASTE';
    renderSourceState();
  });
  query('#analyse-button').addEventListener('click', async (event) => {
    const sourceKind = renderSourceState();
    if (sourceKind === 'NONE') {
      setSourceStatus('Add a source table', 'Upload a file, paste spreadsheet cells, or try the sample data', 'error');
      query('#sample-data-button').focus();
      return;
    }
    if (sourceKind === 'CONFLICT') {
      query('#source-conflict').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      query('#use-file-source').focus();
      return;
    }
    const snapshot = await runBusy(event.currentTarget, 'Analysing…', () => handlers.analyse?.({
      file: view.file, pastedText: pasteInput.value, sourcePreference: view.sourcePreference,
    }));
    if (!snapshot) return;
    view.hiddenColumns.clear();
    applySnapshot(snapshot, true);
    setStep('review');
    if (snapshot.blockers?.length) showNotice(snapshot.blockers[0].recovery, 'error');
    else showNotice('Analysis complete. Check the highlighted columns.', 'success');
  });
  query('#scratch-review-button').addEventListener('click', async (event) => {
    const snapshot = await runBusy(
      event.currentTarget,
      'Preparing…',
      () => handlers.prepareScratch?.(scratchDraft().templateId, scratchDraft()),
    );
    if (!snapshot) return;
    view.hiddenColumns.clear();
    applySnapshot(snapshot, true);
    setStep('review');
    showNotice('The production template is ready to generate.', 'success');
  });
  query('#column-search').addEventListener('input', (event) => {
    view.search = event.target.value; view.page = 0; renderColumnList();
  });
  queryAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      view.filter = button.dataset.filter; view.page = 0;
      queryAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      renderColumnList();
    });
  });
  query('#previous-page').addEventListener('click', () => { view.page -= 1; renderColumnList(); });
  query('#next-page').addEventListener('click', () => { view.page += 1; renderColumnList(); });
  query('#quick-row-count').addEventListener('change', async (event) => {
    const snapshot = await handlers.changeRowCount?.(Number(event.currentTarget.value));
    if (snapshot) applySnapshot(snapshot, false);
  });
  query('#generate-button').addEventListener('click', async (event) => {
    const snapshot = await runBusy(event.currentTarget, 'Generating…', () => handlers.generate?.());
    if (!snapshot?.result) return;
    applySnapshot(snapshot);
    setStep('download');
    showNotice(snapshot.variation?.kind === 'repeatable'
      ? `Generation complete. ${snapshot.variation.text}`
      : 'Generation and output checks are complete. Generate another version whenever you need one.',
    snapshot.result.validationValid ? 'success' : 'error');
  });
  regenerateButton.addEventListener('click', async (event) => {
    const snapshot = await runBusy(event.currentTarget, 'Generating…', () => handlers.generate?.());
    if (!snapshot?.result) return;
    applySnapshot(snapshot);
    showNotice(snapshot.variation?.kind === 'repeatable'
      ? `Generated again. ${snapshot.variation.text}`
      : 'A new version has been generated and checked.',
    snapshot.result.validationValid ? 'success' : 'error');
  });
  query('#preview-table-wrap').addEventListener('scroll', updateVisibleRange, { passive: true });
  const columnsDialog = query('#columns-dialog');
  query('#columns-button').addEventListener('click', () => { renderColumnChooser(); columnsDialog.showModal(); });
  query('#close-columns-dialog').addEventListener('click', () => columnsDialog.close());
  query('#done-columns').addEventListener('click', () => columnsDialog.close());
  query('#column-choice-search').addEventListener('input', renderColumnChooser);
  query('#show-all-columns').addEventListener('click', () => { view.hiddenColumns.clear(); renderPreview(); });
  query('#download-button').addEventListener('click', () => handlers.download?.());
  query('#start-another').addEventListener('click', () => {
    handlers.startAnother?.();
    view.snapshot = null; view.file = null; view.sourcePreference = null; view.hiddenColumns.clear(); view.openColumn = -1;
    view.task = 'transform'; view.selectedTemplates = new Set(['people']);
    view.templateSelections.clear(); view.customColumns = []; view.customColumnSequence = 0;
    fileInput.value = ''; pasteInput.value = '';
    query('#file-label').textContent = 'Drop a CSV, TSV, or TXT file here';
    query('#file-help').textContent = 'Choose a local file. Its contents are never uploaded.';
    renderSourceState(); updateTemplateButtons();
    updateTaskButtons(); renderTemplateFields(); renderCustomColumns();
    hideNotice(); setStep('choose');
  });
  const openAdvanced = () => handlers.openAdvanced?.(
    view.task === 'scratch' && view.step === 'choose' ? scratchDraft() : null,
  );
  query('#advanced-button').addEventListener('click', openAdvanced);
  queryAll('.advanced-link').forEach((button) => button.addEventListener('click', openAdvanced));
  query('#close-advanced-notice').addEventListener('click', hideNotice);
  query('.brand').addEventListener('click', (event) => { event.preventDefault(); setStep('choose'); });
  skipLink.addEventListener('click', (event) => {
    event.preventDefault();
    query('#quick-main')?.setAttribute('tabindex', '-1');
    query('#quick-main')?.focus();
    query('#quick-main')?.scrollIntoView({ block: 'start' });
  });
  updateTaskButtons();
  updateTemplateButtons();
  renderTemplateFields();
  renderCustomColumns();
  setStep('choose');
  host.dataset.quickMounted = 'true';
  const controller = Object.freeze({
    refresh(snapshot) { applySnapshot(snapshot, false); },
    get step() { return view.step; },
    get shadowRoot() { return shadow; },
  });
  host.__quickController = controller;
  return controller;
}
