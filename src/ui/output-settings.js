import { validateRequestedRowCount } from '../core/contracts.js';
import { OUTPUT_ROW_PRESETS } from '../core/constants.js';

export { OUTPUT_ROW_PRESETS };

export function resolveRequestedRowCount({ preset, customValue }) {
  if (preset === 'custom') return validateRequestedRowCount(Number(customValue));
  const value = Number(preset);
  if (!OUTPUT_ROW_PRESETS.includes(value)) throw new RangeError('Select a supported preset or custom row count.');
  return value;
}

export function sameAsInputModel(inputRowCount = null) {
  const rowCount = Number(inputRowCount);
  const available = Number.isInteger(rowCount) && rowCount > 0;
  return Object.freeze({
    available,
    rowCount: available ? rowCount : null,
    label: available ? `Same as input (${rowCount.toLocaleString()})` : 'Same as input',
    note: available
      ? `${rowCount.toLocaleString()} data rows; header excluded. Count only—representative rows may be reordered or reused.`
      : 'Analyse a table to detect its data-row count.',
  });
}

export function syncAnalysedRowControls(elements, inputRowCount, { requiresInputRowCount }) {
  const model = sameAsInputModel(inputRowCount);
  elements.sameAsInputRows.disabled = !model.available;
  elements.sameAsInputRows.textContent = model.label;
  elements.sameAsInputRows.title = model.note;
  elements.sameAsInputNote.textContent = model.note;
  if (!requiresInputRowCount || !model.available) return null;
  elements.customRowPreset.checked = true;
  elements.customRowCount.disabled = false;
  elements.customRowCount.value = String(model.rowCount);
  return model.rowCount;
}

export function selectedOutputModel(requestedRowCount, outputPlan = null) {
  return Object.freeze({
    requestedRowCount,
    recommendedMinimumRows: outputPlan?.recommendedMinimumRows ?? 0,
    belowRecommended: Boolean(outputPlan && requestedRowCount < outputPlan.recommendedMinimumRows),
    missingScenarioCount: outputPlan?.missingScenarioIds?.length ?? 0,
  });
}
