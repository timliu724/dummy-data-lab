import { normaliseActionParams, validateActionParams } from '../policy/action-parameters.js';
import { RelationshipRegistry } from '../relationships/relationship-registry.js';

function requireNonZeroInteger(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[+-]?\d+$/.test(text) || BigInt(text) === 0n) {
    throw new RangeError(`${label} must be an explicit non-zero integer.`);
  }
  return text;
}

export function findUnconfiguredShiftPolicies({ policies, relationshipRules = [] }) {
  const registry = new RelationshipRegistry({ rules: relationshipRules });
  return Object.freeze(policies.flatMap((policy, columnIndex) => {
    if (policy.selectedAction !== 'SHIFT') return [];
    const columnParams = normaliseActionParams({
      action: 'SHIFT', detectedType: policy.detectedType, params: policy.actionParams,
    });
    const group = registry.shiftConfigurationFor(policy.columnName, columnParams.shiftKind);
    const effectiveParams = group ? { ...columnParams, ...group.options, groupId: group.id } : columnParams;
    const validation = validateActionParams({
      action: 'SHIFT', detectedType: policy.detectedType, params: effectiveParams,
    });
    return validation.valid ? [] : [Object.freeze({
      columnIndex,
      columnName: policy.columnName,
      detectedType: policy.detectedType,
      errors: validation.errors,
    })];
  }));
}

export function applySuggestedShiftOffsets({
  policies,
  relationshipRules = [],
  dateOffset,
  timeOffset,
  numberOffset,
}) {
  const missing = findUnconfiguredShiftPolicies({ policies, relationshipRules });
  if (missing.some((entry) => entry.detectedType === 'AMBIGUOUS_DATE')) {
    throw new RangeError('Ambiguous date columns require an individual DD/MM or MM/DD choice in Action settings.');
  }
  const neededTypes = new Set(missing.map((entry) => entry.detectedType));
  const resolved = {
    date: neededTypes.has('DATE') || neededTypes.has('DATETIME')
      ? requireNonZeroInteger(dateOffset, 'Date/datetime offset') : null,
    time: neededTypes.has('TIME') ? requireNonZeroInteger(timeOffset, 'Time offset') : null,
    number: [...neededTypes].some((type) => !['DATE', 'DATETIME', 'TIME'].includes(type))
      ? requireNonZeroInteger(numberOffset, 'Number/sequence offset') : null,
  };
  const missingByIndex = new Map(missing.map((entry) => [entry.columnIndex, entry]));
  return Object.freeze(policies.map((policy, columnIndex) => {
    const entry = missingByIndex.get(columnIndex);
    if (!entry) return policy;
    const temporal = ['DATE', 'DATETIME', 'TIME'].includes(entry.detectedType);
    const offsetValue = entry.detectedType === 'TIME' ? resolved.time : temporal ? resolved.date : resolved.number;
    const unit = entry.detectedType === 'TIME' ? 'MINUTES' : temporal ? 'DAYS' : 'INTEGER';
    const shiftKind = temporal ? 'DATE_TIME' : 'NUMBER_SEQUENCE';
    return Object.freeze({
      ...policy,
      actionParams: normaliseActionParams({
        action: 'SHIFT',
        detectedType: policy.detectedType,
        params: { ...policy.actionParams, shiftKind, offsetMode: 'FIXED', offsetValue, unit },
      }),
      userOverride: true,
      reviewRequired: true,
    });
  }));
}

export function renderShiftReadiness(container, missing, onApply) {
  const documentRef = container.ownerDocument;
  container.hidden = missing.length === 0;
  if (missing.length === 0) {
    container.replaceChildren();
    return;
  }
  const types = new Set(missing.map((entry) => entry.detectedType));
  const wrap = documentRef.createElement('div');
  wrap.className = 'shift-readiness';
  const copy = documentRef.createElement('div');
  const title = documentRef.createElement('strong');
  title.textContent = `${missing.length} SHIFT column${missing.length === 1 ? '' : 's'} need an offset before generation.`;
  const names = documentRef.createElement('small');
  names.textContent = missing.map((entry) => entry.columnName).join(', ');
  copy.append(title, names);

  const controls = documentRef.createElement('div');
  controls.className = 'shift-readiness__controls';
  const inputs = {};
  const addOffset = (key, labelText, value) => {
    const label = documentRef.createElement('label');
    label.textContent = labelText;
    const input = documentRef.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = value;
    input.setAttribute('aria-label', labelText);
    label.append(input);
    controls.append(label);
    inputs[key] = input;
  };
  if (types.has('DATE') || types.has('DATETIME')) addOffset('dateOffset', 'Date/datetime days', '1');
  if (types.has('TIME')) addOffset('timeOffset', 'Time minutes', '60');
  if ([...types].some((type) => !['DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(type))) {
    addOffset('numberOffset', 'Number/sequence offset', '1');
  }
  const ambiguous = types.has('AMBIGUOUS_DATE');
  const apply = documentRef.createElement('button');
  apply.type = 'button';
  apply.className = 'button button--shift-apply';
  apply.textContent = ambiguous ? 'Set ambiguous dates individually' : 'Apply these offsets';
  apply.disabled = ambiguous;
  apply.addEventListener('click', () => onApply({
    dateOffset: inputs.dateOffset?.value,
    timeOffset: inputs.timeOffset?.value,
    numberOffset: inputs.numberOffset?.value,
  }));
  controls.append(apply);
  const boundary = documentRef.createElement('small');
  boundary.className = 'shift-readiness__boundary';
  boundary.textContent = ambiguous
    ? 'Choose DD/MM or MM/DD inside each ambiguous date row.'
    : 'Suggested values are not applied until you click the button. The same entered date offset is used for every listed date/datetime column.';
  wrap.append(copy, controls, boundary);
  container.replaceChildren(wrap);
}
