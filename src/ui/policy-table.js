import { ACTION_VALUES, ATTRIBUTE_ROLE_VALUES } from '../core/constants.js';
import { validatePolicySelection } from '../policy/policy-validation.js';
import { defaultActionParams, normaliseActionParams } from '../policy/action-parameters.js';
import { patternSegments } from '../generation/pattern-generator.js';
import { ATTRIBUTE_ROLE_LABELS, normalizeAttributeRole } from '../privacy/attribute-roles.js';
import { GENERALISATION_STRATEGY_VALUES, generalisationDescription } from '../generation/generalisation-rules.js';
import { createInfoTooltip } from './info-tooltip.js';

function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

function patternSummary(detection) {
  const pattern = detection.details?.pattern;
  return pattern?.dominantShape?.value ?? '—';
}

function sampleSummary(profile) {
  const values = (profile.sampleValues ?? []).slice(0, 2).map((value) => String(value).slice(0, 42));
  return values.length ? values.join(' · ') : '—';
}

export function policyTableRows({ profiles, detections, policies, actionPreviews = [] }) {
  return Object.freeze(policies.map((policy, index) => {
    const profile = profiles[index];
    const detection = detections[index];
    const pattern = detection.details?.pattern;
    return Object.freeze({
      columnIndex: index,
      columnName: policy.columnName,
      detectedType: policy.detectedType,
      confidence: detection.confidence,
      risk: policy.riskLevel,
      nonEmpty: profile.nonEmptyCount,
      nullCount: profile.emptyCount,
      nullPercent: percentage(profile.emptyRatio),
      unique: profile.uniqueCount ?? '≥ unknown',
      uniquePercent: percentage(profile.uniqueRatio),
      lengths: `${profile.lengthStats?.minimum ?? '—'} / ${profile.lengthStats?.maximum ?? '—'}`,
      pattern: patternSummary(detection),
      prefix: pattern?.commonPrefix?.value ?? '—',
      suffix: pattern?.commonSuffix?.value ?? '—',
      sample: sampleSummary(profile),
      recommendedAction: policy.recommendedAction,
      reason: policy.reason ?? '—',
      selectedAction: policy.selectedAction,
      actionParams: policy.actionParams ?? {},
      actionPreview: actionPreviews[index] ?? null,
      patternParts: policy.selectedAction === 'PATTERN_REPLACE'
        ? patternSegments(profile.sampleValues?.[0] ?? '')
            .filter((segment) => segment.segmentIndex !== null)
            .slice(0, 8)
        : Object.freeze([]),
      reviewRequired: policy.reviewRequired,
      highRiskKeep: policy.riskLevel === 'HIGH' && policy.selectedAction === 'KEEP',
      detectionEvidence: detection.evidence ?? Object.freeze([]),
      recognizerLabel: detection.details?.recognizerLabel ?? null,
      checksumValidated: detection.details?.checksumValidated === true,
      contextConfirmed: detection.details?.contextConfirmed === true,
      allowlistedSampleCount: detection.details?.allowlistedSampleCount ?? 0,
      attributeRole: policy.attributeRole ?? 'ORDINARY',
      attributeRoleConfidence: policy.attributeRoleConfidence ?? 'MEDIUM',
      attributeRoleReason: policy.attributeRoleReason ?? 'No role evidence is available.',
      attributeRoleSource: policy.attributeRoleSource ?? 'INFERRED',
    });
  }));
}

export function updatePolicyAction({ policies, detections, columnIndex, action }) {
  if (!ACTION_VALUES.includes(action)) throw new RangeError('Unknown policy action.');
  const policy = policies[columnIndex];
  if (!policy) throw new RangeError('Column policy was not found.');
  const validation = validatePolicySelection({
    columnName: policy.columnName,
    riskAssessment: policy.riskAssessment,
    detection: detections[columnIndex],
    recommendedAction: policy.recommendedAction,
    selectedAction: action,
  });
  const updated = Object.freeze({
    ...policy,
    selectedAction: action,
    actionParams: action === policy.recommendedAction
      ? policy.recommendedActionParams ?? defaultActionParams(action, policy.detectedType)
      : defaultActionParams(action, policy.detectedType),
    userOverride: action !== policy.recommendedAction,
    warnings: validation.warnings,
    reviewRequired: validation.reviewRequired,
  });
  return Object.freeze(policies.map((entry, index) => index === columnIndex ? updated : entry));
}

export function updatePolicyActionParams({ policies, columnIndex, params }) {
  const policy = policies[columnIndex];
  if (!policy) throw new RangeError('Column policy was not found.');
  const updated = Object.freeze({
    ...policy,
    actionParams: normaliseActionParams({
      action: policy.selectedAction,
      detectedType: policy.detectedType,
      params: { ...policy.actionParams, ...params },
    }),
    userOverride: true,
    reviewRequired: true,
  });
  return Object.freeze(policies.map((entry, index) => index === columnIndex ? updated : entry));
}

export function updatePolicyAttributeRole({ policies, columnIndex, role }) {
  const policy = policies[columnIndex];
  if (!policy) throw new RangeError('Column policy was not found.');
  const restoreInference = role === 'AUTO';
  const selectedRole = restoreInference
    ? normalizeAttributeRole(policy.inferredAttributeRole ?? 'ORDINARY')
    : normalizeAttributeRole(role);
  const updated = Object.freeze({
    ...policy,
    attributeRole: selectedRole,
    attributeRoleConfidence: restoreInference ? (policy.inferredAttributeRoleConfidence ?? 'MEDIUM') : 'HIGH',
    attributeRoleReason: restoreInference
      ? (policy.inferredAttributeRoleReason ?? 'No role evidence is available.')
      : `User selected ${ATTRIBUTE_ROLE_LABELS[selectedRole]}. The Final Action was not changed.`,
    attributeRoleSource: restoreInference ? 'INFERRED' : 'USER',
  });
  return Object.freeze(policies.map((entry, index) => index === columnIndex ? updated : entry));
}

export function keepAllPolicies({ policies, detections }) {
  return Object.freeze(policies.map((policy, columnIndex) => updatePolicyAction({
    policies: [policy],
    detections: [detections[columnIndex]],
    columnIndex: 0,
    action: 'KEEP',
  })[0]));
}

export function applyRecommendedPolicies({ policies, detections }) {
  return Object.freeze(policies.map((policy, columnIndex) => updatePolicyAction({
    policies: [policy],
    detections: [detections[columnIndex]],
    columnIndex: 0,
    action: policy.recommendedAction,
  })[0]));
}

const COLUMN_LABELS = Object.freeze([
  'Column', 'Detected / risk', 'Profile evidence', 'Recommended', 'Final Action', 'Action settings', 'Review',
]);
const BASIC_COLUMN_LABELS = Object.freeze(['Column / sample', 'Suggested', 'Final Action', 'Preview / required setting', 'Check']);
const ACTION_LABELS = Object.freeze({
  KEEP: 'Keep source values',
  REPLACE: 'Create fictional values',
  PATTERN_REPLACE: 'Regenerate the same format',
  SHIFT: 'Shift by a fixed amount',
  RESAMPLE: 'Reuse valid choices or ranges',
  GENERALISE: 'Reduce the level of detail',
  TEXT_SANITISE: 'Remove identifiers from text',
  CLEAR: 'Leave values blank',
  DROP: 'Remove this column',
});

function actionLabel(action) {
  return ACTION_LABELS[action] ?? String(action).replaceAll('_', ' ').toLocaleLowerCase();
}

function policyHeaderHelp(basic, label) {
  if ((!basic && label === 'Review') || (basic && label === 'Check')) {
    return Object.freeze({
      label: 'What Review means',
      content: 'Review means confirm a recommendation because of risk, ambiguity, or low confidence. It does not mean generation failed.',
      placement: 'below-right',
    });
  }
  if (!basic && label === 'Detected / risk') {
    return Object.freeze({
      label: 'About privacy roles',
      content: 'Direct identifiers can identify a person or record. Quasi-identifiers may single out records when combined. Sensitive attributes need protection. Ordinary means no special privacy role was detected. Changing a role guides recommendations but does not silently replace your current Final Action.',
      placement: 'below-left',
    });
  }
  return null;
}

const DEFAULT_POLICY_PAGE_SIZE = 12;
const POLICY_VIEW_STATE = new WeakMap();

export function filterPolicyRows(rows, { query = '', filter = 'ALL' } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  return Object.freeze(rows.filter((row) => {
    const matchesQuery = needle === '' || [
      row.columnName, row.detectedType, row.risk, row.recommendedAction, row.selectedAction,
    ].some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
    const matchesFilter = filter === 'ALL'
      || (filter === 'REVIEW' && row.reviewRequired)
      || (filter === 'CHANGED' && row.selectedAction !== row.recommendedAction)
      || (filter === 'SHIFT' && row.selectedAction === 'SHIFT');
    return matchesQuery && matchesFilter;
  }));
}

export function policyPageModel(rows, { page = 1, pageSize = DEFAULT_POLICY_PAGE_SIZE } = {}) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError('Policy page size must be a positive integer.');
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Number.isInteger(page) ? page : 1));
  const startIndex = rows.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(rows.length, startIndex + pageSize);
  return Object.freeze({
    rows: Object.freeze(rows.slice(startIndex, endIndex)),
    totalRowCount: rows.length,
    page: currentPage,
    pageCount,
    startNumber: rows.length === 0 ? 0 : startIndex + 1,
    endNumber: endIndex,
  });
}

function appendOption(documentRef, select, value, label, selected) {
  const option = documentRef.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = value === selected;
  select.append(option);
}

function appendLabeledControl(documentRef, parent, labelText, control) {
  const label = documentRef.createElement('label');
  label.className = 'action-setting';
  const caption = documentRef.createElement('span');
  caption.textContent = labelText;
  label.append(caption, control);
  parent.append(label);
}

function setMobileCellLabel(cell, label) {
  cell.dataset.label = label;
  return cell;
}

function renderShiftSettings(documentRef, row, rowIndex, onParamsChange) {
  const params = normaliseActionParams({ action: 'SHIFT', detectedType: row.detectedType, params: row.actionParams });
  const wrap = documentRef.createElement('div');
  wrap.className = 'shift-settings';

  const kind = documentRef.createElement('select');
  kind.setAttribute('aria-label', `Shift kind for ${row.columnName}`);
  appendOption(documentRef, kind, 'DATE_TIME', 'Date / time', params.shiftKind);
  appendOption(documentRef, kind, 'NUMBER_SEQUENCE', 'Number / sequence', params.shiftKind);
  kind.addEventListener('change', () => onParamsChange(rowIndex, {
    shiftKind: kind.value,
    unit: kind.value === 'NUMBER_SEQUENCE' ? 'INTEGER' : (row.detectedType === 'TIME' ? 'MINUTES' : 'DAYS'),
  }));
  appendLabeledControl(documentRef, wrap, 'Kind', kind);

  const mode = documentRef.createElement('select');
  mode.setAttribute('aria-label', `Offset mode for ${row.columnName}`);
  appendOption(documentRef, mode, 'FIXED', 'Fixed', params.offsetMode);
  appendOption(documentRef, mode, 'RANDOM_ONCE', 'Random once', params.offsetMode);
  mode.addEventListener('change', () => onParamsChange(rowIndex, { offsetMode: mode.value }));
  appendLabeledControl(documentRef, wrap, 'Offset mode', mode);

  if (params.offsetMode === 'FIXED') {
    const offset = documentRef.createElement('input');
    offset.type = 'number';
    offset.step = '1';
    offset.value = params.offsetValue ?? '';
    offset.placeholder = '+1 / -7 / +66';
    offset.setAttribute('aria-label', `Fixed offset for ${row.columnName}`);
    offset.addEventListener('change', () => onParamsChange(rowIndex, { offsetValue: offset.value }));
    appendLabeledControl(documentRef, wrap, 'Fixed offset', offset);
  } else {
    for (const [key, labelText] of [['rangeMinimum', 'Minimum'], ['rangeMaximum', 'Maximum']]) {
      const range = documentRef.createElement('input');
      range.type = 'number';
      range.step = '1';
      range.value = params[key] ?? '';
      range.addEventListener('change', () => onParamsChange(rowIndex, { [key]: range.value }));
      appendLabeledControl(documentRef, wrap, labelText, range);
    }
  }

  const unit = documentRef.createElement('select');
  unit.setAttribute('aria-label', `Shift unit for ${row.columnName}`);
  if (params.shiftKind === 'NUMBER_SEQUENCE') {
    appendOption(documentRef, unit, 'INTEGER', 'Whole number', params.unit);
  } else if (row.detectedType === 'TIME') {
    appendOption(documentRef, unit, 'HOURS', 'Hours', params.unit);
    appendOption(documentRef, unit, 'MINUTES', 'Minutes', params.unit);
  } else {
    appendOption(documentRef, unit, 'DAYS', 'Days', params.unit);
  }
  unit.addEventListener('change', () => onParamsChange(rowIndex, { unit: unit.value }));
  appendLabeledControl(documentRef, wrap, 'Unit', unit);

  if (row.detectedType === 'AMBIGUOUS_DATE') {
    const orientation = documentRef.createElement('select');
    orientation.setAttribute('aria-label', `Date orientation for ${row.columnName}`);
    appendOption(documentRef, orientation, '', 'Choose date order…', params.dateOrientation ?? '');
    appendOption(documentRef, orientation, 'DMY', 'DD/MM/YYYY', params.dateOrientation);
    appendOption(documentRef, orientation, 'MDY', 'MM/DD/YYYY', params.dateOrientation);
    orientation.addEventListener('change', () => onParamsChange(rowIndex, { dateOrientation: orientation.value || null }));
    appendLabeledControl(documentRef, wrap, 'Date order (required)', orientation);
  }

  if (params.shiftKind === 'NUMBER_SEQUENCE') {
    const segment = documentRef.createElement('input');
    segment.type = 'number';
    segment.min = '1';
    segment.step = '1';
    segment.value = String(params.segmentIndex + 1);
    segment.addEventListener('change', () => onParamsChange(rowIndex, { segmentIndex: Math.max(0, Number(segment.value) - 1) }));
    appendLabeledControl(documentRef, wrap, 'Numeric segment (1 = first)', segment);

    const flags = documentRef.createElement('div');
    flags.className = 'shift-flags';
    for (const [key, labelText] of [['preserveWidth', 'Preserve zero padding'], ['allowWidthExpansion', 'Allow width expansion']]) {
      const label = documentRef.createElement('label');
      const checkbox = documentRef.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(params[key]);
      checkbox.addEventListener('change', () => onParamsChange(rowIndex, { [key]: checkbox.checked }));
      label.append(checkbox, documentRef.createTextNode(` ${labelText}`));
      flags.append(label);
    }
    wrap.append(flags);
  }
  return wrap;
}

function renderBasicShiftSettings(documentRef, row, rowIndex, onParamsChange, onRequestAdvanced) {
  const params = normaliseActionParams({ action: 'SHIFT', detectedType: row.detectedType, params: row.actionParams });
  const wrap = documentRef.createElement('div');
  wrap.className = 'basic-shift-settings';
  if (params.offsetMode !== 'FIXED') {
    const active = documentRef.createElement('strong');
    active.textContent = `Advanced random-once shift is active (${params.rangeMinimum ?? '?'} to ${params.rangeMaximum ?? '?'}).`;
    const edit = documentRef.createElement('button');
    edit.type = 'button';
    edit.className = 'basic-advanced-jump';
    edit.textContent = 'Edit in Advanced';
    edit.addEventListener('click', () => onRequestAdvanced?.());
    wrap.append(active, edit);
    return wrap;
  }

  const offset = documentRef.createElement('input');
  offset.type = 'number';
  offset.step = '1';
  offset.value = params.offsetValue ?? '';
  offset.placeholder = params.shiftKind === 'NUMBER_SEQUENCE' ? '+66 / -77' : '+1 / -7';
  offset.setAttribute('aria-label', `Fixed offset for ${row.columnName}`);
  offset.addEventListener('change', () => onParamsChange(rowIndex, { offsetMode: 'FIXED', offsetValue: offset.value }));
  appendLabeledControl(
    documentRef,
    wrap,
    params.shiftKind === 'NUMBER_SEQUENCE' ? 'Whole-number offset' : (row.detectedType === 'TIME' ? 'Time offset' : 'Days offset'),
    offset,
  );

  if (row.detectedType === 'TIME') {
    const unit = documentRef.createElement('select');
    unit.setAttribute('aria-label', `Shift unit for ${row.columnName}`);
    appendOption(documentRef, unit, 'MINUTES', 'Minutes', params.unit);
    appendOption(documentRef, unit, 'HOURS', 'Hours', params.unit);
    unit.addEventListener('change', () => onParamsChange(rowIndex, { unit: unit.value }));
    appendLabeledControl(documentRef, wrap, 'Unit', unit);
  }

  if (row.detectedType === 'AMBIGUOUS_DATE') {
    const orientation = documentRef.createElement('select');
    orientation.setAttribute('aria-label', `Date orientation for ${row.columnName}`);
    appendOption(documentRef, orientation, '', 'Choose date order…', params.dateOrientation ?? '');
    appendOption(documentRef, orientation, 'DMY', 'DD/MM/YYYY', params.dateOrientation);
    appendOption(documentRef, orientation, 'MDY', 'MM/DD/YYYY', params.dateOrientation);
    orientation.addEventListener('change', () => onParamsChange(rowIndex, { dateOrientation: orientation.value || null }));
    appendLabeledControl(documentRef, wrap, 'Date order', orientation);
  }

  if (params.shiftKind === 'NUMBER_SEQUENCE' && Number(params.segmentIndex ?? 0) !== 0) {
    const note = documentRef.createElement('small');
    note.textContent = `Advanced setting: number segment ${Number(params.segmentIndex) + 1}.`;
    wrap.append(note);
  }
  return wrap;
}

function renderReplacementSettings(documentRef, row, rowIndex, onParamsChange) {
  const params = normaliseActionParams({
    action: row.selectedAction,
    detectedType: row.detectedType,
    params: row.actionParams,
  });
  const wrap = documentRef.createElement('div');
  wrap.className = 'replacement-settings';
  const behavior = documentRef.createElement('select');
  behavior.setAttribute('aria-label', `Repeat handling for ${row.columnName}`);
  appendOption(documentRef, behavior, 'AUTO', 'Smart — keep source repeats consistent', params.repeatHandling);
  appendOption(documentRef, behavior, 'CONSISTENT', 'Consistent — always reuse the same result', params.repeatHandling);
  appendOption(documentRef, behavior, 'INDEPENDENT', 'Independent — generate a new result each time', params.repeatHandling);
  behavior.addEventListener('change', () => onParamsChange(rowIndex, { repeatHandling: behavior.value }));
  appendLabeledControl(documentRef, wrap, 'Repeated values', behavior);
  const help = documentRef.createElement('small');
  help.textContent = params.repeatHandling === 'CONSISTENT'
    ? 'The same source value always gets the same replacement.'
    : params.repeatHandling === 'INDEPENDENT'
      ? 'Every occurrence gets a new replacement.'
      : 'Existing repeats stay consistent; extra generated rows may vary.';
  wrap.append(help);
  if (row.selectedAction === 'PATTERN_REPLACE') {
    const patternMode = documentRef.createElement('select');
    patternMode.setAttribute('aria-label', `Pattern mode for ${row.columnName}`);
    appendOption(documentRef, patternMode, 'AUTO', 'Smart — preserve detected structure', params.patternMode);
    appendOption(documentRef, patternMode, 'REGENERATE_ALL', 'Replace every letter and digit', params.patternMode);
    appendOption(documentRef, patternMode, 'CUSTOM', 'Custom parts', params.patternMode);
    patternMode.addEventListener('change', () => onParamsChange(rowIndex, { patternMode: patternMode.value }));
    appendLabeledControl(documentRef, wrap, 'Pattern handling', patternMode);

    const patternHelp = documentRef.createElement('small');
    patternHelp.textContent = params.patternMode === 'AUTO'
      ? 'Keeps trusted prefixes or suffixes, such as 44, and replaces the remaining letters and digits.'
      : params.patternMode === 'REGENERATE_ALL'
        ? 'Keeps separators and shape; replaces every letter and digit.'
        : 'Choose which parts to keep, generate, or replace with fixed text.';
    wrap.append(patternHelp);

    const multiValue = documentRef.createElement('label');
    multiValue.className = 'multi-value-setting';
    const multiValueToggle = documentRef.createElement('input');
    multiValueToggle.type = 'checkbox';
    multiValueToggle.checked = params.multiValueMode === 'FORCE'
      || (params.multiValueMode === 'AUTO' && params.multiValueDetected);
    multiValueToggle.setAttribute('aria-label', `Replace each ID or code separately for ${row.columnName}`);
    multiValueToggle.addEventListener('change', () => onParamsChange(rowIndex, {
      multiValueMode: multiValueToggle.checked
        ? (params.multiValueDetected ? 'AUTO' : 'FORCE')
        : 'OFF',
    }));
    const multiValueText = documentRef.createElement('span');
    const separators = params.multiValueSeparatorKinds.length > 0
      ? params.multiValueSeparatorKinds.map((kind) => kind.toLowerCase()).join(', ')
      : 'detected';
    const status = params.multiValueMode === 'OFF'
      ? 'The whole cell is replaced as one pattern. Separators may still look unchanged.'
      : params.multiValueMode === 'FORCE'
        ? 'Each item is replaced separately; separators stay unchanged.'
        : params.multiValueDetected
          ? `List detected (${params.multiValueConfidence}). Each item keeps its own pattern; ${separators} separators stay unchanged.`
          : params.multiValueConfidence === 'MEDIUM'
            ? 'Possible list detected. Enable only if the cell contains separate IDs or codes.'
            : 'No list detected. Enable only if the cell contains separate IDs or codes.';
    multiValueText.textContent = 'Replace each ID or code in the cell separately';
    const multiValueHelp = documentRef.createElement('small');
    multiValueHelp.textContent = status;
    multiValue.append(multiValueToggle, multiValueText, multiValueHelp);
    wrap.append(multiValue);

    if (params.patternMode === 'CUSTOM') {
      wrap.append(renderCustomPatternSettings(documentRef, row, rowIndex, params, onParamsChange));
    }
  }
  return wrap;
}

function updatedSegmentRules(params, segmentIndex, patch) {
  const current = [...(params.segmentRules ?? [])];
  const existingIndex = current.findIndex((rule) => rule.segmentIndex === segmentIndex);
  const existing = existingIndex >= 0
    ? current[existingIndex]
    : { segmentIndex, action: 'DEFAULT', replacement: '' };
  const updated = { ...existing, ...patch, segmentIndex };
  if (updated.action === 'DEFAULT') {
    if (existingIndex >= 0) current.splice(existingIndex, 1);
  } else if (existingIndex >= 0) current[existingIndex] = updated;
  else current.push(updated);
  return current.sort((left, right) => left.segmentIndex - right.segmentIndex);
}

function renderAffixControls(documentRef, parent, row, rowIndex, params, direction, onParamsChange) {
  const capitalised = direction[0].toUpperCase() + direction.slice(1);
  const actionKey = `${direction}Action`;
  const lengthKey = `${direction}Length`;
  const replacementKey = `${direction}Replacement`;
  const group = documentRef.createElement('div');
  group.className = 'pattern-affix-rule';

  const action = documentRef.createElement('select');
  action.setAttribute('aria-label', `${capitalised} action for ${row.columnName}`);
  appendOption(documentRef, action, 'DEFAULT', 'Use other-parts setting', params[actionKey]);
  appendOption(documentRef, action, 'KEEP', 'Keep source', params[actionKey]);
  appendOption(documentRef, action, 'GENERATE', 'Generate', params[actionKey]);
  appendOption(documentRef, action, 'REPLACE', 'Fixed replacement', params[actionKey]);
  action.addEventListener('change', () => onParamsChange(rowIndex, { [actionKey]: action.value }));
  appendLabeledControl(documentRef, group, `${capitalised} rule`, action);

  const length = documentRef.createElement('input');
  length.type = 'number';
  length.min = '0';
  length.max = '256';
  length.step = '1';
  length.value = String(params[lengthKey] ?? 0);
  length.setAttribute('aria-label', `${capitalised} length for ${row.columnName}`);
  length.addEventListener('change', () => onParamsChange(rowIndex, { [lengthKey]: length.value }));
  appendLabeledControl(documentRef, group, `${capitalised} characters`, length);

  if (params[actionKey] === 'REPLACE') {
    const replacement = documentRef.createElement('input');
    replacement.type = 'text';
    replacement.value = params[replacementKey] ?? '';
    replacement.placeholder = direction === 'prefix' ? 'e.g. HM or 88' : 'fixed ending';
    replacement.setAttribute('aria-label', `${capitalised} replacement for ${row.columnName}`);
    replacement.addEventListener('change', () => onParamsChange(rowIndex, { [replacementKey]: replacement.value }));
    appendLabeledControl(documentRef, group, 'Replacement', replacement);
  }
  parent.append(group);
}

function renderCustomPatternSettings(documentRef, row, rowIndex, params, onParamsChange) {
  const custom = documentRef.createElement('div');
  custom.className = 'pattern-custom-settings';
  const warning = documentRef.createElement('strong');
  warning.className = 'pattern-source-warning';
  warning.textContent = 'Any kept part remains source data (pseudonymised, not anonymous).';
  custom.append(warning);

  const fallback = documentRef.createElement('select');
  fallback.setAttribute('aria-label', `Other part handling for ${row.columnName}`);
  appendOption(documentRef, fallback, 'GENERATE', 'Generate all unselected parts', params.customDefaultAction);
  appendOption(documentRef, fallback, 'KEEP', 'Keep all unselected parts', params.customDefaultAction);
  fallback.addEventListener('change', () => onParamsChange(rowIndex, { customDefaultAction: fallback.value }));
  appendLabeledControl(documentRef, custom, 'Other parts', fallback);

  renderAffixControls(documentRef, custom, row, rowIndex, params, 'prefix', onParamsChange);
  renderAffixControls(documentRef, custom, row, rowIndex, params, 'suffix', onParamsChange);

  if (row.patternParts.length > 0) {
    const parts = documentRef.createElement('div');
    parts.className = 'pattern-segment-rules';
    const title = documentRef.createElement('small');
    title.textContent = 'Detected letter / number parts from the first sample:';
    parts.append(title);
    for (const part of row.patternParts) {
      const rule = params.segmentRules.find((candidate) => candidate.segmentIndex === part.segmentIndex)
        ?? { action: 'DEFAULT', replacement: '' };
      const line = documentRef.createElement('div');
      line.className = 'pattern-segment-rule';
      const label = documentRef.createElement('code');
      label.textContent = `${part.segmentIndex + 1}: ${part.value}`;
      const select = documentRef.createElement('select');
      select.setAttribute('aria-label', `Part ${part.segmentIndex + 1} action for ${row.columnName}`);
      appendOption(documentRef, select, 'DEFAULT', 'Use other-parts setting', rule.action);
      appendOption(documentRef, select, 'KEEP', 'Keep source', rule.action);
      appendOption(documentRef, select, 'GENERATE', 'Generate', rule.action);
      appendOption(documentRef, select, 'REPLACE', 'Fixed replacement', rule.action);
      select.addEventListener('change', () => onParamsChange(rowIndex, {
        segmentRules: updatedSegmentRules(params, part.segmentIndex, { action: select.value }),
      }));
      line.append(label, select);
      if (rule.action === 'REPLACE') {
        const replacement = documentRef.createElement('input');
        replacement.type = 'text';
        replacement.value = rule.replacement;
        replacement.placeholder = `exactly ${[...part.value].length} chars`;
        replacement.setAttribute('aria-label', `Part ${part.segmentIndex + 1} replacement for ${row.columnName}`);
        replacement.addEventListener('change', () => onParamsChange(rowIndex, {
          segmentRules: updatedSegmentRules(params, part.segmentIndex, { replacement: replacement.value }),
        }));
        line.append(replacement);
      }
      parts.append(line);
    }
    custom.append(parts);
  }
  return custom;
}

function renderActionPreview(documentRef, row, businessFidelityLabel = 'Balanced', { open = false, onToggle = null } = {}) {
  const details = documentRef.createElement('details');
  details.className = 'action-preview';
  details.open = open;
  const summary = documentRef.createElement('summary');
  summary.textContent = `${businessFidelityLabel} preview · ${actionLabel(row.selectedAction)}`;
  details.append(summary);
  details.addEventListener('toggle', () => onToggle?.(details.open));

  const preview = row.actionPreview;
  if (!preview || preview.status !== 'READY') {
    const message = documentRef.createElement('small');
    message.className = preview?.status === 'ERROR' ? 'action-preview-error' : 'action-preview-note';
    message.textContent = preview?.message ?? 'Preview is not available yet.';
    details.append(message);
    return details;
  }

  for (const example of preview.examples) {
    const pair = documentRef.createElement('div');
    pair.className = 'action-preview-pair';
    const source = documentRef.createElement('span');
    source.className = 'action-preview-source';
    source.textContent = example.source === '' ? '(blank)' : example.source;
    const arrow = documentRef.createElement('span');
    arrow.className = 'action-preview-arrow';
    arrow.textContent = '→';
    const proposed = documentRef.createElement('strong');
    proposed.className = 'action-preview-proposed';
    proposed.textContent = example.proposed;
    pair.append(source, arrow, proposed);
    details.append(pair);
  }
  const note = documentRef.createElement('small');
  note.className = 'action-preview-note';
  const modeNotes = {
    Flexible: 'Flexible may change row order and consecutive groups when you generate.',
    Balanced: 'Balanced also preserves useful groups and relationships when you generate.',
    'High match': 'High match also locks source row count and order when you generate.',
  };
  note.textContent = `${modeNotes[businessFidelityLabel] ?? 'Row and group ordering is applied when you generate.'} Values stay the same across modes when this field rule itself is unchanged.`;
  details.append(note);
  return details;
}

function renderGeneralisationSettings(documentRef, row, rowIndex, onParamsChange) {
  const params = normaliseActionParams({ action: 'GENERALISE', detectedType: row.detectedType, params: row.actionParams });
  const wrap = documentRef.createElement('div');
  wrap.className = 'generalisation-settings';
  const strategy = documentRef.createElement('select');
  strategy.setAttribute('aria-label', `Generalisation strategy for ${row.columnName}`);
  const labels = {
    AUTO: 'Auto for this field',
    AGE_BAND: 'Age bands',
    POSTCODE_PREFIX: 'Postcode prefix + mask',
    DATE_PRECISION: 'Date / time precision',
    NUMERIC_BAND: 'Numeric bands',
    CATEGORY_GROUP: 'Stable category groups',
    TEXT_LENGTH_BAND: 'Text length bands',
  };
  GENERALISATION_STRATEGY_VALUES.forEach((value) => appendOption(documentRef, strategy, value, labels[value], params.strategy));
  strategy.addEventListener('change', () => onParamsChange(rowIndex, { strategy: strategy.value }));
  appendLabeledControl(documentRef, wrap, 'Method', strategy);

  const level = documentRef.createElement('select');
  level.setAttribute('aria-label', `Generalisation level for ${row.columnName}`);
  appendOption(documentRef, level, 'LOW', 'Low — more detail', params.level);
  appendOption(documentRef, level, 'MEDIUM', 'Medium — balanced', params.level);
  appendOption(documentRef, level, 'HIGH', 'High — broader groups', params.level);
  level.addEventListener('change', () => onParamsChange(rowIndex, { level: level.value }));
  appendLabeledControl(documentRef, wrap, 'Level', level);
  const description = documentRef.createElement('small');
  description.textContent = generalisationDescription({
    strategy: params.strategy,
    level: params.level,
    detectedType: row.detectedType,
    columnName: row.columnName,
  });
  wrap.append(description);
  return wrap;
}

function renderBasicActionDetails(documentRef, row, rowIndex, {
  onParamsChange,
  onRequestAdvanced,
  businessFidelityLabel,
  previewOpen,
  onPreviewToggle,
}) {
  const wrap = documentRef.createElement('div');
  wrap.className = 'policy-card__action-details';
  if (row.selectedAction === 'SHIFT') {
    wrap.append(renderBasicShiftSettings(documentRef, row, rowIndex, onParamsChange ?? (() => {}), onRequestAdvanced));
  } else if (['REPLACE', 'PATTERN_REPLACE'].includes(row.selectedAction)) {
    const params = normaliseActionParams({ action: row.selectedAction, detectedType: row.detectedType, params: row.actionParams });
    const summary = documentRef.createElement('span');
    summary.className = 'basic-rule-summary';
    if (row.selectedAction === 'PATTERN_REPLACE') {
      const multipleValuesActive = params.multiValueMode === 'FORCE'
        || (params.multiValueMode === 'AUTO' && params.multiValueDetected);
      const possibleMultipleValues = !multipleValuesActive && params.multiValueConfidence === 'MEDIUM';
      summary.textContent = `Uses ${params.patternMode === 'AUTO' ? 'smart structure' : params.patternMode.toLocaleLowerCase().replaceAll('_', ' ')}`
        + (multipleValuesActive ? ' · handles each list item separately' : '')
        + (possibleMultipleValues ? ' · possible list needs an Advanced review' : '');
    } else {
      summary.textContent = 'The same source value receives the same fictional replacement.';
    }
    const edit = documentRef.createElement('button');
    edit.type = 'button';
    edit.className = 'basic-advanced-jump';
    edit.textContent = 'Advanced settings';
    edit.addEventListener('click', () => onRequestAdvanced?.());
    wrap.append(summary, edit);
  } else if (row.selectedAction === 'GENERALISE') {
    const params = normaliseActionParams({ action: 'GENERALISE', detectedType: row.detectedType, params: row.actionParams });
    const summary = documentRef.createElement('span');
    summary.className = 'basic-rule-summary';
    summary.textContent = `${params.level[0]}${params.level.slice(1).toLocaleLowerCase()} detail reduction`;
    const edit = documentRef.createElement('button');
    edit.type = 'button';
    edit.className = 'basic-advanced-jump';
    edit.textContent = 'Choose a hierarchy in Advanced';
    edit.addEventListener('click', () => onRequestAdvanced?.());
    wrap.append(summary, edit);
  }
  wrap.append(renderActionPreview(documentRef, row, businessFidelityLabel, {
    open: previewOpen,
    onToggle: onPreviewToggle,
  }));
  return wrap;
}

function renderBasicPolicyCards(documentRef, pageModel, data, view, {
  onActionChange,
  onParamsChange,
  onRequestAdvanced,
}) {
  if (pageModel.rows.length === 0) {
    const empty = documentRef.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'No columns match this filter.';
    return empty;
  }
  const grid = documentRef.createElement('div');
  grid.className = 'policy-card-grid';
  pageModel.rows.forEach((row) => {
    const rowIndex = row.columnIndex;
    const card = documentRef.createElement('article');
    card.className = `policy-card ${row.reviewRequired ? 'policy-card--review' : 'policy-card--ready'}`;
    if (row.highRiskKeep) card.classList.add('is-danger');

    const heading = documentRef.createElement('header');
    heading.className = 'policy-card__heading';
    const identity = documentRef.createElement('div');
    const name = documentRef.createElement('h3');
    name.textContent = row.columnName;
    const meta = documentRef.createElement('p');
    meta.className = 'policy-card__meta';
    meta.textContent = `${ATTRIBUTE_ROLE_LABELS[row.attributeRole] ?? row.attributeRole} · ${row.risk.toLocaleLowerCase()} risk · ${row.detectedType.replaceAll('_', ' ').toLocaleLowerCase()}`;
    identity.append(name, meta);
    const status = documentRef.createElement('strong');
    status.className = `policy-card__status ${row.reviewRequired ? 'is-review' : 'is-ready'}`;
    status.textContent = row.reviewRequired ? 'Review' : 'Ready';
    heading.append(identity, status);

    const evidence = documentRef.createElement('div');
    evidence.className = 'policy-card__evidence';
    const sampleLabel = documentRef.createElement('span');
    sampleLabel.textContent = 'Example from source';
    const sample = documentRef.createElement('strong');
    sample.textContent = row.sample;
    evidence.append(sampleLabel, sample);
    if (row.recognizerLabel) {
      const verified = documentRef.createElement('span');
      verified.className = 'recognizer-verified';
      verified.textContent = 'AU checksum verified';
      evidence.append(verified);
    }

    const recommendation = documentRef.createElement('div');
    recommendation.className = 'policy-card__recommendation';
    const recommendationHeading = documentRef.createElement('strong');
    recommendationHeading.textContent = `Recommended · ${actionLabel(row.recommendedAction)}`;
    const recommendationReason = documentRef.createElement('p');
    recommendationReason.textContent = row.reason;
    recommendation.append(recommendationHeading, recommendationReason);

    const decision = documentRef.createElement('div');
    decision.className = 'policy-card__decision';
    const actionControl = documentRef.createElement('label');
    const actionCaption = documentRef.createElement('span');
    actionCaption.textContent = 'Final action';
    const select = documentRef.createElement('select');
    select.className = 'policy-action';
    select.setAttribute('aria-label', `Final action for ${row.columnName}`);
    ACTION_VALUES.forEach((action) => appendOption(documentRef, select, action, actionLabel(action), row.selectedAction));
    select.addEventListener('change', () => onActionChange?.(rowIndex, select.value));
    actionControl.append(actionCaption, select);
    decision.append(actionControl);
    if (row.selectedAction !== row.recommendedAction) {
      const restore = documentRef.createElement('button');
      restore.type = 'button';
      restore.className = 'recommendation-restore';
      restore.textContent = `Restore recommendation: ${actionLabel(row.recommendedAction)}`;
      restore.addEventListener('click', () => onActionChange?.(rowIndex, row.recommendedAction));
      decision.append(restore);
    }

    const details = renderBasicActionDetails(documentRef, row, rowIndex, {
      onParamsChange,
      onRequestAdvanced,
      businessFidelityLabel: data.businessFidelityLabel,
      previewOpen: view.openPreviews.has(rowIndex),
      onPreviewToggle(open) {
        if (open) view.openPreviews.add(rowIndex);
        else view.openPreviews.delete(rowIndex);
      },
    });
    card.append(heading, evidence, recommendation, decision, details);
    grid.append(card);
  });
  return grid;
}

export function renderPolicyTable(container, data, handlers) {
  const rows = policyTableRows(data);
  const onActionChange = typeof handlers === 'function' ? handlers : handlers?.onActionChange;
  const onParamsChange = typeof handlers === 'object' ? handlers?.onParamsChange : null;
  const onRequestAdvanced = typeof handlers === 'object' ? handlers?.onRequestAdvanced : null;
  const onRoleChange = typeof handlers === 'object' ? handlers?.onRoleChange : null;
  const basic = data.interfaceMode !== 'ADVANCED';
  const documentRef = container.ownerDocument;
  const view = POLICY_VIEW_STATE.get(container) ?? {
    query: '', filter: 'ALL', page: 1, pageSize: DEFAULT_POLICY_PAGE_SIZE, openPreviews: new Set(),
  };
  if (!(view.openPreviews instanceof Set)) view.openPreviews = new Set();
  const filteredRows = filterPolicyRows(rows, view);
  const pageModel = policyPageModel(filteredRows, view);
  view.page = pageModel.page;
  POLICY_VIEW_STATE.set(container, view);
  const rerender = () => renderPolicyTable(container, data, handlers);

  container.classList.add('policy-workbench');
  const shell = documentRef.createElement('div');
  shell.className = 'policy-table-shell';
  const controls = documentRef.createElement('div');
  controls.className = 'policy-list-controls';
  const search = documentRef.createElement('input');
  search.type = 'text';
  search.value = view.query;
  search.placeholder = 'Filter column names…';
  search.setAttribute('aria-label', 'Filter policy columns');
  search.addEventListener('input', () => {
    view.query = search.value;
    view.page = 1;
    rerender();
    const replacement = container.querySelector('input[aria-label="Filter policy columns"]');
    replacement?.focus();
    replacement?.setSelectionRange?.(replacement.value.length, replacement.value.length);
  });
  const filter = documentRef.createElement('select');
  filter.setAttribute('aria-label', 'Filter policy rows');
  const filterOptions = basic
    ? [['ALL', 'All columns'], ['REVIEW', 'Needs my review'], ['CHANGED', 'Changed only']]
    : [['ALL', 'All columns'], ['REVIEW', 'Review required'], ['CHANGED', 'Changed only'], ['SHIFT', 'SHIFT only']];
  for (const [value, label] of filterOptions) appendOption(documentRef, filter, value, label, view.filter);
  filter.addEventListener('change', () => {
    view.filter = filter.value;
    view.page = 1;
    rerender();
  });
  const count = documentRef.createElement('strong');
  count.className = 'policy-list-count';
  count.textContent = `${pageModel.startNumber}–${pageModel.endNumber} of ${pageModel.totalRowCount} columns`;
  controls.append(search, filter, count);

  if (basic) {
    const cards = renderBasicPolicyCards(documentRef, pageModel, data, view, {
      onActionChange,
      onParamsChange,
      onRequestAdvanced,
    });
    const pagination = documentRef.createElement('div');
    pagination.className = 'policy-pagination';
    const previous = documentRef.createElement('button');
    previous.type = 'button';
    previous.className = 'button';
    previous.textContent = 'Previous';
    previous.disabled = pageModel.page <= 1;
    previous.addEventListener('click', () => { view.page -= 1; rerender(); });
    const pageStatus = documentRef.createElement('span');
    pageStatus.textContent = `Page ${pageModel.page} of ${pageModel.pageCount}`;
    const next = documentRef.createElement('button');
    next.type = 'button';
    next.className = 'button';
    next.textContent = 'Next';
    next.disabled = pageModel.page >= pageModel.pageCount;
    next.addEventListener('click', () => { view.page += 1; rerender(); });
    pagination.append(previous, pageStatus, next);
    shell.append(controls, cards, pagination);
    container.replaceChildren(shell);
    return;
  }

  const tableScroll = documentRef.createElement('div');
  tableScroll.className = 'policy-table-scroll';
  const table = documentRef.createElement('table');
  table.className = `policy-table ${basic ? 'policy-table--basic' : 'policy-table--advanced'}`;
  const head = documentRef.createElement('thead');
  const headRow = documentRef.createElement('tr');
  (basic ? BASIC_COLUMN_LABELS : COLUMN_LABELS).forEach((label) => {
    const cell = documentRef.createElement('th');
    cell.scope = 'col';
    const help = policyHeaderHelp(basic, label);
    if (help) {
      const heading = documentRef.createElement('span');
      heading.className = 'table-heading-with-help';
      const text = documentRef.createElement('span');
      text.textContent = label;
      heading.append(text, createInfoTooltip(documentRef, help));
      cell.append(heading);
    } else {
      cell.textContent = label;
    }
    headRow.append(cell);
  });
  head.append(headRow);
  const body = documentRef.createElement('tbody');
  pageModel.rows.forEach((row) => {
    const rowIndex = row.columnIndex;
    const tableRow = documentRef.createElement('tr');
    if (row.highRiskKeep) tableRow.classList.add('is-danger');
    if (basic) {
      const columnCell = documentRef.createElement('td');
      const columnName = documentRef.createElement('strong');
      columnName.className = 'policy-column-name';
      columnName.textContent = row.columnName;
      const columnMeta = documentRef.createElement('small');
      columnMeta.className = 'basic-column-meta';
      columnMeta.textContent = `${row.detectedType} · ${row.risk} risk`;
      const sample = documentRef.createElement('strong');
      sample.className = 'profile-sample';
      sample.textContent = `Sample: ${row.sample}`;
      columnCell.append(columnName, columnMeta, sample);
      const roleBadge = documentRef.createElement('span');
      roleBadge.className = 'attribute-role-badge';
      roleBadge.textContent = ATTRIBUTE_ROLE_LABELS[row.attributeRole] ?? row.attributeRole;
      roleBadge.title = row.attributeRoleReason;
      columnCell.append(roleBadge);
      if (row.recognizerLabel) {
        const verified = documentRef.createElement('strong');
        verified.className = 'recognizer-verified';
        verified.textContent = 'AU checksum verified';
        columnCell.append(verified);
      }
      setMobileCellLabel(columnCell, 'Column');
      tableRow.append(columnCell);
    } else {
      const columnCell = documentRef.createElement('td');
      const columnName = documentRef.createElement('strong');
      columnName.className = 'policy-column-name';
      columnName.textContent = row.columnName;
      columnCell.append(columnName);
      const detectedCell = documentRef.createElement('td');
      detectedCell.textContent = `${row.detectedType} · ${row.confidence} confidence · ${row.risk} risk`;
      tableRow.append(columnCell, detectedCell);

      if (row.recognizerLabel && detectedCell) {
        const verified = documentRef.createElement('strong');
        verified.className = 'recognizer-verified';
        verified.textContent = row.checksumValidated ? 'Checksum verified' : 'Recognizer match';
        const explanation = documentRef.createElement('details');
        explanation.className = 'recognizer-explanation';
        const explanationSummary = documentRef.createElement('summary');
        explanationSummary.textContent = 'Why detected?';
        const list = documentRef.createElement('ul');
        row.detectionEvidence.forEach((item) => {
          const entry = documentRef.createElement('li');
          entry.textContent = item;
          list.append(entry);
        });
        explanation.append(explanationSummary, list);
        detectedCell.append(verified, explanation);
      }
      if (detectedCell) {
        const roleLabel = documentRef.createElement('label');
        roleLabel.className = 'attribute-role-control';
        const roleCaption = documentRef.createElement('span');
        roleCaption.textContent = `Privacy role · ${row.attributeRoleConfidence.toLocaleLowerCase()} confidence`;
        const roleSelect = documentRef.createElement('select');
        roleSelect.setAttribute('aria-label', `Attribute role for ${row.columnName}`);
        const selectedRole = row.attributeRoleSource === 'INFERRED' ? 'AUTO' : row.attributeRole;
        appendOption(documentRef, roleSelect, 'AUTO', 'Auto-detect role', selectedRole);
        ATTRIBUTE_ROLE_VALUES.forEach((role) => appendOption(documentRef, roleSelect, role, ATTRIBUTE_ROLE_LABELS[role], selectedRole));
        roleSelect.addEventListener('change', () => onRoleChange?.(rowIndex, roleSelect.value));
        const roleReason = documentRef.createElement('small');
        roleReason.textContent = row.attributeRoleReason;
        roleLabel.append(roleCaption, roleSelect, roleReason);
        detectedCell.append(roleLabel);
      }

      const evidenceCell = documentRef.createElement('td');
      const evidenceSummary = documentRef.createElement('span');
      evidenceSummary.textContent = `${row.nonEmpty} non-empty · ${row.nullPercent} null · ${row.uniquePercent} unique\nLength ${row.lengths} · Pattern ${row.pattern}`;
      const sample = documentRef.createElement('strong');
      sample.className = 'profile-sample';
      sample.textContent = `Sample: ${row.sample}`;
      evidenceCell.append(evidenceSummary, sample);
      tableRow.append(evidenceCell);
    }

    const recommendationCell = documentRef.createElement('td');
    const recommendationAction = documentRef.createElement('strong');
    recommendationAction.textContent = row.recommendedAction;
    const recommendationReason = documentRef.createElement('span');
    recommendationReason.textContent = row.reason;
    if (basic) recommendationReason.className = 'basic-recommendation-reason';
    recommendationCell.append(recommendationAction, recommendationReason);
    setMobileCellLabel(recommendationCell, 'Suggested');
    tableRow.append(recommendationCell);

    const actionCell = documentRef.createElement('td');
    const select = documentRef.createElement('select');
    select.className = 'policy-action';
    select.setAttribute('aria-label', `Action for ${row.columnName}`);
    ACTION_VALUES.forEach((action) => {
      const option = documentRef.createElement('option');
      option.value = action;
      option.textContent = action;
      option.selected = action === row.selectedAction;
      select.append(option);
    });
    select.addEventListener('change', () => onActionChange?.(rowIndex, select.value));
    const reminder = documentRef.createElement('span');
    reminder.className = 'final-action-recommendation';
    reminder.textContent = `Recommended: ${row.recommendedAction}`;
    actionCell.append(select, reminder);
    if (row.selectedAction !== row.recommendedAction) {
      const restore = documentRef.createElement('button');
      restore.type = 'button';
      restore.className = 'recommendation-restore';
      restore.textContent = 'Use recommendation';
      restore.setAttribute('aria-label', `Use ${row.recommendedAction} recommendation for ${row.columnName}`);
      restore.addEventListener('click', () => onActionChange?.(rowIndex, row.recommendedAction));
      actionCell.append(restore);
    }
    setMobileCellLabel(actionCell, 'Final Action');
    tableRow.append(actionCell);
    const settingsCell = documentRef.createElement('td');
    if (row.selectedAction === 'SHIFT') {
      settingsCell.append(basic
        ? renderBasicShiftSettings(documentRef, row, rowIndex, onParamsChange ?? (() => {}), onRequestAdvanced)
        : renderShiftSettings(documentRef, row, rowIndex, onParamsChange ?? (() => {})));
    } else if (['REPLACE', 'PATTERN_REPLACE'].includes(row.selectedAction)) {
      if (basic) {
        const params = normaliseActionParams({ action: row.selectedAction, detectedType: row.detectedType, params: row.actionParams });
        const summary = documentRef.createElement('span');
        summary.className = 'basic-rule-summary';
        if (row.selectedAction === 'PATTERN_REPLACE') {
          const multipleValuesActive = params.multiValueMode === 'FORCE'
            || (params.multiValueMode === 'AUTO' && params.multiValueDetected);
          const possibleMultipleValues = !multipleValuesActive && params.multiValueConfidence === 'MEDIUM';
          summary.textContent = `Pattern: ${params.patternMode === 'AUTO' ? 'Smart structure' : params.patternMode.toLowerCase().replaceAll('_', ' ')}`
            + (multipleValuesActive ? ' · List items: separate' : '')
            + (possibleMultipleValues ? ' · Possible list: review in Advanced' : '');
        } else {
          summary.textContent = 'Consistent replacement (smart default)';
        }
        const edit = documentRef.createElement('button');
        edit.type = 'button';
        edit.className = 'basic-advanced-jump';
        edit.textContent = 'Fine-tune in Advanced';
        edit.addEventListener('click', () => onRequestAdvanced?.());
        settingsCell.append(summary, edit);
      } else {
        settingsCell.append(renderReplacementSettings(documentRef, row, rowIndex, onParamsChange ?? (() => {})));
      }
    } else if (row.selectedAction === 'GENERALISE') {
      if (basic) {
        const params = normaliseActionParams({ action: 'GENERALISE', detectedType: row.detectedType, params: row.actionParams });
        const summary = documentRef.createElement('span');
        summary.className = 'basic-rule-summary';
        summary.textContent = `Generalise · ${params.level.toLocaleLowerCase()}`;
        const edit = documentRef.createElement('button');
        edit.type = 'button';
        edit.className = 'basic-advanced-jump';
        edit.textContent = 'Choose hierarchy in Advanced';
        edit.addEventListener('click', () => onRequestAdvanced?.());
        settingsCell.append(summary, edit);
      } else {
        settingsCell.append(renderGeneralisationSettings(documentRef, row, rowIndex, onParamsChange ?? (() => {})));
      }
    } else if (!basic) {
      const noSettings = documentRef.createElement('span');
      noSettings.className = 'muted-cell';
      noSettings.textContent = 'No settings needed';
      settingsCell.append(noSettings);
    }
    settingsCell.append(renderActionPreview(documentRef, row, data.businessFidelityLabel, {
      open: view.openPreviews.has(rowIndex),
      onToggle(open) {
        if (open) view.openPreviews.add(rowIndex);
        else view.openPreviews.delete(rowIndex);
      },
    }));
    setMobileCellLabel(settingsCell, 'Preview / setting');
    tableRow.append(settingsCell);
    const reviewCell = documentRef.createElement('td');
    reviewCell.textContent = row.reviewRequired ? 'Review' : 'Ready';
    reviewCell.className = row.reviewRequired ? 'review-yes' : 'review-no';
    setMobileCellLabel(reviewCell, 'Check');
    tableRow.append(reviewCell);
    body.append(tableRow);
  });
  table.append(head, body);
  if (pageModel.rows.length > 0) {
    tableScroll.append(table);
  } else {
    const empty = documentRef.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = 'No columns match this filter.';
    tableScroll.append(empty);
  }

  const pagination = documentRef.createElement('div');
  pagination.className = 'policy-pagination';
  const previous = documentRef.createElement('button');
  previous.type = 'button';
  previous.className = 'button';
  previous.textContent = 'Previous';
  previous.disabled = pageModel.page <= 1;
  previous.addEventListener('click', () => { view.page -= 1; rerender(); });
  const pageStatus = documentRef.createElement('span');
  pageStatus.textContent = `Page ${pageModel.page} of ${pageModel.pageCount}`;
  const next = documentRef.createElement('button');
  next.type = 'button';
  next.className = 'button';
  next.textContent = 'Next';
  next.disabled = pageModel.page >= pageModel.pageCount;
  next.addEventListener('click', () => { view.page += 1; rerender(); });
  pagination.append(previous, pageStatus, next);
  shell.append(controls, tableScroll, pagination);
  container.replaceChildren(shell);
}
