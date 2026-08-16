import { createGeneratedColumn } from '../schema/output-schema.js';
import { createProviderCatalog } from '../generation/provider-catalog.js';
import { BASIC_GENERATOR_IDS } from './scratch-mode.js';

const catalog = createProviderCatalog();

export function defaultGeneratorSettings(generatorType) {
  const common = { nullRate: 0, unique: false };
  if (generatorType === 'integer') return { ...common, minimum: 1, maximum: 1000 };
  if (generatorType === 'decimal') return { ...common, minimum: 0, maximum: 1000, decimals: 2 };
  if (generatorType === 'category') return { ...common, values: ['Active', 'Pending', 'Closed'], weights: [60, 25, 15] };
  if (generatorType === 'date') return { ...common, startDate: '2020-01-01', endDate: '2035-12-31' };
  if (generatorType === 'sequence') return { ...common, prefix: 'ID-', start: 1, step: 1, width: 5, unique: true };
  if (generatorType === 'constant') return { ...common, value: 'Test' };
  if (generatorType === 'copy-column') return { ...common, sourceColumnId: '', sourceColumnName: '' };
  if (generatorType === 'template') return { ...common, sourceColumnId: '', sourceColumnName: '', prefix: '', suffix: '' };
  if (generatorType === 'date-after') return { ...common, sourceColumnId: '', sourceColumnName: '', minimumDays: 1, maximumDays: 30 };
  if (generatorType === 'foreign-key') return { ...common, targetTableId: '', targetColumnId: '', targetTableName: '', targetColumnName: '' };
  if (generatorType === 'lookup-foreign') return { ...common, foreignKeyColumnId: '', targetTableId: '', targetColumnId: '', targetTableName: '', targetColumnName: '' };
  if (generatorType === 'date-after-foreign') return { ...common, foreignKeyColumnId: '', targetTableId: '', targetColumnId: '', targetTableName: '', targetColumnName: '', minimumDays: 1, maximumDays: 30 };
  return common;
}

export function newGeneratedColumn(sequence, position, generatorType = 'person-name', suggestedName = null) {
  return createGeneratedColumn({
    id: `generated-user-${sequence}`,
    name: suggestedName || `New column ${sequence}`,
    generatorType,
    position,
    settings: defaultGeneratorSettings(generatorType),
  });
}

function button(label, title, onClick, disabled = false) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'mini-action';
  control.textContent = label;
  control.title = title;
  control.disabled = disabled;
  control.addEventListener('click', onClick);
  return control;
}

function settingInput(labelText, value, { type = 'number', min, max, step, onChange }) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);
  input.addEventListener('change', () => onChange(type === 'number' ? Number(input.value) : input.value));
  label.append(input);
  return label;
}

function dependencySelect(column, availableColumns, onSettingsChange) {
  const label = document.createElement('label');
  label.textContent = 'Based on column';
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a column…';
  select.append(placeholder);
  for (const candidate of availableColumns.filter((entry) => entry.id !== column.id && entry.enabled !== false)) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.name} · ${candidate.origin === 'SOURCE' ? 'source' : 'generated'}`;
    option.selected = candidate.id === column.settings?.sourceColumnId;
    option.dataset.columnName = candidate.name;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const selected = select.selectedOptions[0];
    onSettingsChange({ sourceColumnId: select.value, sourceColumnName: selected?.dataset.columnName ?? '' });
  });
  label.append(select);
  return label;
}

function renderSettings(container, column, onSettingsChange, availableColumns) {
  const settings = column.settings ?? {};
  const common = document.createElement('div');
  common.className = 'generator-settings-grid';
  common.append(settingInput('Blank values (%)', settings.nullRate ?? 0, {
    min: 0, max: 100, step: 1, onChange: (nullRate) => onSettingsChange({ nullRate }),
  }));
  const unique = document.createElement('label');
  unique.className = 'checkbox-setting';
  const uniqueInput = document.createElement('input');
  uniqueInput.type = 'checkbox';
  uniqueInput.checked = Boolean(settings.unique);
  uniqueInput.addEventListener('change', () => onSettingsChange({ unique: uniqueInput.checked }));
  unique.append(uniqueInput, document.createTextNode(' Require unique non-blank values'));
  common.append(unique);

  if (['integer', 'decimal'].includes(column.generatorType)) {
    common.append(
      settingInput('Minimum', settings.minimum, { step: column.generatorType === 'integer' ? 1 : 'any', onChange: (minimum) => onSettingsChange({ minimum }) }),
      settingInput('Maximum', settings.maximum, { step: column.generatorType === 'integer' ? 1 : 'any', onChange: (maximum) => onSettingsChange({ maximum }) }),
    );
    if (column.generatorType === 'decimal') {
      common.append(settingInput('Decimal places', settings.decimals ?? 2, { min: 0, max: 8, step: 1, onChange: (decimals) => onSettingsChange({ decimals }) }));
    }
  } else if (column.generatorType === 'sequence') {
    common.append(
      settingInput('Prefix', settings.prefix ?? 'ID-', { type: 'text', onChange: (prefix) => onSettingsChange({ prefix }) }),
      settingInput('Start', settings.start ?? 1, { step: 1, onChange: (start) => onSettingsChange({ start }) }),
      settingInput('Step', settings.step ?? 1, { step: 1, onChange: (step) => onSettingsChange({ step }) }),
      settingInput('Number width', settings.width ?? 5, { min: 1, max: 16, step: 1, onChange: (width) => onSettingsChange({ width }) }),
    );
  } else if (column.generatorType === 'category') {
    const values = Array.isArray(settings.values) ? settings.values.join(', ') : settings.values;
    const weights = Array.isArray(settings.weights) ? settings.weights.join(', ') : settings.weights;
    common.append(
      settingInput('Values (comma-separated)', values, { type: 'text', onChange: (next) => onSettingsChange({ values: next.split(',').map((value) => value.trim()).filter(Boolean) }) }),
      settingInput('Weights (same order)', weights, { type: 'text', onChange: (next) => onSettingsChange({ weights: next.split(',').map(Number) }) }),
    );
  } else if (column.generatorType === 'date') {
    common.append(
      settingInput('Start date', settings.startDate, { type: 'date', onChange: (startDate) => onSettingsChange({ startDate }) }),
      settingInput('End date', settings.endDate, { type: 'date', onChange: (endDate) => onSettingsChange({ endDate }) }),
    );
  } else if (column.generatorType === 'constant') {
    common.append(settingInput('Value', settings.value ?? 'Test', { type: 'text', onChange: (value) => onSettingsChange({ value }) }));
  } else if (['foreign-key', 'lookup-foreign', 'date-after-foreign'].includes(column.generatorType)) {
    const target = document.createElement('p');
    target.className = 'foreign-key-target';
    target.textContent = settings.targetTableName && settings.targetColumnName
      ? `${column.generatorType === 'foreign-key' ? 'References' : column.generatorType === 'lookup-foreign' ? 'Copies' : 'Occurs after'} ${settings.targetTableName}.${settings.targetColumnName}`
      : 'Choose the target under Project tables.';
    common.append(target);
  } else if (['copy-column', 'template', 'date-after'].includes(column.generatorType)) {
    common.append(dependencySelect(column, availableColumns, onSettingsChange));
    if (column.generatorType === 'template') {
      common.append(
        settingInput('Text before', settings.prefix ?? '', { type: 'text', onChange: (prefix) => onSettingsChange({ prefix }) }),
        settingInput('Text after', settings.suffix ?? '', { type: 'text', onChange: (suffix) => onSettingsChange({ suffix }) }),
      );
    }
    if (column.generatorType === 'date-after') {
      common.append(
        settingInput('Minimum days after', settings.minimumDays ?? 1, { step: 1, onChange: (minimumDays) => onSettingsChange({ minimumDays }) }),
        settingInput('Maximum days after', settings.maximumDays ?? 30, { step: 1, onChange: (maximumDays) => onSettingsChange({ maximumDays }) }),
      );
    }
  }
  container.append(common);
}

export function renderGeneratedColumnEditor(container, columns, handlers = {}, availableColumns = columns, {
  interfaceMode = 'ADVANCED',
  protectedColumnIds = [],
  expandedBlockIds = [],
} = {}) {
  container.replaceChildren();
  if (columns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'generated-empty';
    empty.textContent = 'No generated columns yet. Your transformed columns will still be exported.';
    container.append(empty);
    return;
  }
  const basicMode = interfaceMode === 'BASIC';
  const protectedIds = new Set(protectedColumnIds);
  const expanded = new Set(expandedBlockIds);
  const groups = [];
  const groupsById = new Map();
  for (const [index, column] of columns.entries()) {
    const blockId = column.blockId || 'custom-fields';
    let group = groupsById.get(blockId);
    if (!group) {
      group = { blockId, label: column.blockLabel || 'Custom fields', entries: [] };
      groupsById.set(blockId, group);
      groups.push(group);
    }
    group.entries.push({ column, index });
  }

  for (const group of groups) {
    const groupDetails = document.createElement('details');
    groupDetails.className = 'generated-column-group';
    groupDetails.dataset.blockId = group.blockId;
    groupDetails.open = expanded.has(group.blockId);

    const groupSummary = document.createElement('summary');
    const groupTitle = document.createElement('span');
    groupTitle.className = 'generated-column-group__title';
    const groupName = document.createElement('strong');
    groupName.textContent = group.label;
    const groupCount = document.createElement('small');
    groupCount.textContent = `${group.entries.length} field${group.entries.length === 1 ? '' : 's'}`;
    groupTitle.append(groupName, groupCount);
    groupSummary.append(groupTitle);
    groupDetails.append(groupSummary);
    groupDetails.addEventListener('toggle', () => handlers.onGroupToggle?.(group.blockId, groupDetails.open));

    const groupBody = document.createElement('div');
    groupBody.className = 'generated-column-group__body';
    for (const [groupIndex, { column, index }] of group.entries.entries()) {
      const card = document.createElement('article');
      card.className = 'generated-column-card';
      card.dataset.columnId = column.id;
      const row = document.createElement('div');
      row.className = 'generated-column-row';

      const origin = document.createElement('span');
      origin.className = 'column-origin';
      origin.textContent = column.blockLabel ? 'FIELD' : 'GENERATED';

      const name = document.createElement('input');
      name.value = column.name;
      name.setAttribute('aria-label', `Generated column ${index + 1} name`);
      name.addEventListener('input', () => handlers.onChange?.(column.id, { name: name.value }));

      const managedInBasic = basicMode && (protectedIds.has(column.id) || !BASIC_GENERATOR_IDS.includes(column.generatorType));
      let type;
      if (managedInBasic) {
        type = document.createElement('span');
        type.className = 'column-type-summary';
        type.setAttribute('aria-label', `Generated column ${index + 1} managed type`);
        type.textContent = `Managed · ${catalog.getGenerator(column.generatorType).label}`;
        type.title = 'This field participates in a key or dependency. Switch to Advanced to change its type.';
      } else {
        type = document.createElement('select');
        type.setAttribute('aria-label', `Generated column ${index + 1} type`);
        const allowedGenerators = basicMode
          ? catalog.listGenerators().filter((generator) => BASIC_GENERATOR_IDS.includes(generator.id))
          : catalog.listGenerators();
        for (const generator of allowedGenerators) {
          const option = document.createElement('option');
          option.value = generator.id;
          option.textContent = generator.label;
          option.selected = generator.id === column.generatorType;
          type.append(option);
        }
        type.addEventListener('change', () => handlers.onTypeChange?.(column.id, type.value));
      }

      const actions = document.createElement('div');
      actions.className = 'column-actions';
      actions.append(
        button('↑', 'Move up within this group', () => handlers.onMove?.(column.id, -1), groupIndex === 0),
        button('↓', 'Move down within this group', () => handlers.onMove?.(column.id, 1), groupIndex === group.entries.length - 1),
        button('Copy', managedInBasic ? 'Managed fields can be duplicated in Advanced mode.' : 'Duplicate column', () => handlers.onDuplicate?.(column.id), managedInBasic),
        button('×', managedInBasic ? 'Managed fields can be removed in Advanced mode.' : 'Remove column', () => handlers.onRemove?.(column.id), managedInBasic),
      );
      row.append(origin, name, type, actions);

      const details = document.createElement('details');
      details.className = 'generator-settings advanced-only';
      const summary = document.createElement('summary');
      summary.textContent = 'Settings · range, blanks, uniqueness, distribution';
      details.append(summary);
      renderSettings(details, column, (changes) => handlers.onSettingsChange?.(column.id, changes), availableColumns);
      card.append(row, details);
      groupBody.append(card);
    }
    groupDetails.append(groupBody);
    container.append(groupDetails);
  }
}
