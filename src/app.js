import { exportCsv } from './export/export-csv.js';
import { exportTsv } from './export/export-tsv.js';
import { downloadBlob } from './export/download-blob.js';
import { isDatasetResultDownloadable, isGeneratedResultDownloadable } from './export/export-availability.js';
import { analyseInput, replanCoverage } from './pipeline/analyse-input.js';
import { generateFromAnalysis } from './pipeline/generate-from-analysis.js';
import { collectSourceComparison } from './pipeline/source-comparison.js';
import { buildActionPreviews } from './generation/action-preview.js';
import {
  assertSafeFallback,
  classifyInputSize,
  estimateGenerationCost,
  estimateTextBytes,
  generationCostConfirmationMessage,
} from './performance/size-policy.js';
import { formulaRiskSummary } from './export/excel-safety.js';
import { coverageNotice, renderCoverageSummary } from './ui/coverage-summary.js';
import { delimiterFromControl, parseOptionsFromControls, parseRecognitionAllowlist, requiresHeaderConfirmation, selectInputValue } from './ui/input-panel.js';
import { createUiMessage, mergeUiMessage, renderMessages } from './ui/messages.js';
import { summarizeGenerationWarnings, summarizeValidationIssues } from './ui/generation-feedback.js';
import { resolveRequestedRowCount, sameAsInputModel } from './ui/output-settings.js';
import { renderParseSummary } from './ui/parse-summary.js';
import {
  applyRecommendedPolicies,
  keepAllPolicies,
  renderPolicyTable,
  updatePolicyAction,
  updatePolicyActionParams,
  updatePolicyAttributeRole,
} from './ui/policy-table.js';
import { normaliseActionParams } from './policy/action-parameters.js';
import { renderInlineComparisonTable, renderPreviewTable } from './ui/preview-table.js';
import { renderProgress } from './ui/progress-panel.js';
import { interfaceModeModel } from './ui/interface-mode.js';
import {
  addMappingGroup,
  addShiftGroup,
  renderMappingGroupBuilder,
  renderRelationshipPanel,
  renderShiftGroupBuilder,
  setRelationshipEnabled,
} from './ui/relationship-panel.js';
import { transitionWorkflow } from './ui/workflow-state.js';
import {
  applySuggestedShiftOffsets,
  findUnconfiguredShiftPolicies,
  renderShiftReadiness,
} from './ui/shift-readiness.js';
import { createInlineWorker } from './worker/create-inline-worker.js';
import { APP_RELEASE } from './version.js';
import { relationshipIsActive } from './core/contracts.js';
import { combineOutputSchema, createSourceOutputSchema } from './schema/output-schema.js';
import { defaultGeneratorSettings, newGeneratedColumn, renderGeneratedColumnEditor } from './ui/generated-column-editor.js';
import { renderGenerationValidation } from './ui/generation-validation.js';
import { generateStandaloneDataset } from './generation/generated-column-engine.js';
import { SeededRandomSource } from './generation/random-source.js';
import { appendDatasetTemplateBlock, getDatasetTemplate, listDatasetTemplates } from './templates/dataset-templates.js';
import { createGenerationConfig, parseGenerationConfig, serializeGenerationConfig } from './config/generation-config.js';
import { downloadJson } from './export/download-json.js';
import { createProviderCatalog } from './generation/provider-catalog.js';
import {
  createPersonalFieldSet,
  parsePersonalFieldSets,
  PERSONAL_FIELD_SETS_KEY,
  removePersonalFieldSet,
  serializePersonalFieldSets,
  upsertPersonalFieldSet,
} from './presets/personal-field-sets.js';
import { createDatasetTable, generateIndependentDataset } from './dataset/multi-table-dataset.js';
import { renderDatasetIntegrity, summarizeDatasetIntegrityFailure } from './ui/dataset-integrity.js';
import { createQualityReport, serializeQualityReport } from './quality/quality-report.js';
import { renderQualityReport } from './ui/quality-report.js';
import { createConnectedCommerceScenario } from './templates/connected-scenario.js';
import { TRANSFORM_SAMPLE, isTransformSampleText } from './examples/transform-sample.js';
import { downloadDatasetArchive, prepareDatasetArchive } from './export/dataset-archive.js';
import {
  DEFAULT_BUSINESS_FIDELITY,
  businessFidelityModel,
  defaultBusinessFidelitySettings,
  normaliseBusinessFidelitySettings,
} from './business/fidelity.js';
import { mountQuickPrototypeSurface } from './ui/quick-prototype-surface.js';
import {
  businessFidelityImpactModel,
  generationVariationModel,
} from './ui/generation-expectations.js';
import {
  BASIC_GENERATOR_IDS,
  BASIC_QUICK_ADD_IDS,
  basicProtectedColumnIds,
  scratchAdvancedSummary,
} from './ui/scratch-mode.js';

const providerCatalog = createProviderCatalog();

const elements = Object.freeze({
  quickSurfaceHost: document.querySelector('#quick-surface-host'),
  fileInput: document.querySelector('#file-input'),
  fileName: document.querySelector('#file-name'),
  pasteInput: document.querySelector('#paste-input'),
  delimiterMode: document.querySelector('#delimiter-mode'),
  customDelimiterWrap: document.querySelector('#custom-delimiter-wrap'),
  customDelimiter: document.querySelector('#custom-delimiter'),
  headerMode: document.querySelector('#header-mode'),
  analyseButton: document.querySelector('#analyse-button'),
  advancedSampleData: document.querySelector('#advanced-sample-data'),
  advancedSourceStatus: document.querySelector('#advanced-source-status'),
  advancedSourceConflict: document.querySelector('#advanced-source-conflict'),
  advancedUseFileSource: document.querySelector('#advanced-use-file-source'),
  advancedUsePasteSource: document.querySelector('#advanced-use-paste-source'),
  advancedPasteField: document.querySelector('.paste-field'),
  parseSummary: document.querySelector('#parse-summary'),
  customRowPreset: document.querySelector('input[name="row-count"][value="custom"]'),
  customRowCount: document.querySelector('#custom-row-count'),
  sameAsInputRows: document.querySelector('#same-as-input-rows'),
  sameAsInputNote: document.querySelector('#same-as-input-note'),
  modeSelect: document.querySelector('#mode-select'),
  modeBoundary: document.querySelector('#mode-boundary'),
  businessFidelityInputs: [...document.querySelectorAll('input[name="business-fidelity"]')],
  businessFidelityBoundary: document.querySelector('#business-fidelity-boundary'),
  businessFidelityImpact: document.querySelector('#business-fidelity-impact'),
  businessFidelitySettings: [...document.querySelectorAll('[data-fidelity-setting]')],
  coverageSummary: document.querySelector('#coverage-summary'),
  policyTable: document.querySelector('#policy-table'),
  keepAllButton: document.querySelector('#keep-all-button'),
  applyRecommendationsButton: document.querySelector('#apply-recommendations-button'),
  shiftReadiness: document.querySelector('#shift-readiness'),
  relationshipPanel: document.querySelector('#relationship-panel'),
  mappingGroupBuilder: document.querySelector('#mapping-group-builder'),
  shiftGroupBuilder: document.querySelector('#shift-group-builder'),
  reviewConfirm: document.querySelector('#review-confirm'),
  reviewConfirmation: document.querySelector('#review-confirmation'),
  generationReadiness: document.querySelector('#generation-readiness'),
  generateButton: document.querySelector('#generate-button'),
  advancedRegenerate: document.querySelector('#advanced-regenerate'),
  previewTable: document.querySelector('#preview-table'),
  previewControls: document.querySelector('#preview-controls'),
  compareControls: document.querySelector('#compare-controls'),
  compareToggle: document.querySelector('#compare-toggle'),
  previewRowNote: document.querySelector('#preview-row-note'),
  excelSafe: document.querySelector('#excel-safe'),
  exportCsv: document.querySelector('#export-csv'),
  exportTsv: document.querySelector('#export-tsv'),
  progressPanel: document.querySelector('#progress-panel'),
  cancelButton: document.querySelector('#cancel-button'),
  messages: document.querySelector('#messages'),
  inputOptions: document.querySelector('#input-options'),
  recognitionAllowlist: document.querySelector('#recognition-allowlist'),
  interfaceModeButtons: [...document.querySelectorAll('button[data-interface-mode]')],
  basicModeLabel: document.querySelector('#basic-mode-label'),
  appVersion: document.querySelector('#app-version'),
  addGeneratedColumn: document.querySelector('#add-generated-column'),
  generatedColumnsPanel: document.querySelector('#generated-columns-panel'),
  generatedColumnsToggle: document.querySelector('#generated-columns-toggle'),
  generatedColumnsWorkspace: document.querySelector('#generated-columns-workspace'),
  generatedColumnEditor: document.querySelector('#generated-column-editor'),
  probeButton: document.querySelector('#probe-button'),
  probeRowCount: document.querySelector('#probe-row-count'),
  generationValidation: document.querySelector('#generation-validation'),
  workflowKindButtons: [...document.querySelectorAll('button[data-workflow-kind]')],
  templatePicker: document.querySelector('#template-picker'),
  templateSelectionSummary: document.querySelector('#template-selection-summary'),
  templateSelectionText: document.querySelector('#template-selection-text'),
  reviewGeneratedColumns: document.querySelector('#review-generated-columns'),
  downloadConfig: document.querySelector('#download-config'),
  configFile: document.querySelector('#config-file'),
  generatorSearch: document.querySelector('#generator-search'),
  generatorCatalog: document.querySelector('#generator-catalog'),
  personalSetName: document.querySelector('#personal-set-name'),
  savePersonalSet: document.querySelector('#save-personal-set'),
  personalSetPicker: document.querySelector('#personal-set-picker'),
  loadPersonalSet: document.querySelector('#load-personal-set'),
  deletePersonalSet: document.querySelector('#delete-personal-set'),
  scratchStructureButtons: [...document.querySelectorAll('button[data-scratch-structure]')],
  datasetTableTabs: document.querySelector('#dataset-table-tabs'),
  addDatasetTable: document.querySelector('#add-dataset-table'),
  datasetTableName: document.querySelector('#dataset-table-name'),
  deleteDatasetTable: document.querySelector('#delete-dataset-table'),
  datasetPreviewTabs: document.querySelector('#dataset-preview-tabs'),
  datasetPrimaryKey: document.querySelector('#dataset-primary-key'),
  datasetForeignTarget: document.querySelector('#dataset-foreign-target'),
  addForeignKey: document.querySelector('#add-foreign-key'),
  datasetKeySummary: document.querySelector('#dataset-key-summary'),
  datasetCardinalityRules: document.querySelector('#dataset-cardinality-rules'),
  crossRuleForeignKey: document.querySelector('#cross-rule-foreign-key'),
  crossRuleParentColumn: document.querySelector('#cross-rule-parent-column'),
  crossRuleKind: document.querySelector('#cross-rule-kind'),
  crossRuleName: document.querySelector('#cross-rule-name'),
  crossRuleMinDays: document.querySelector('#cross-rule-min-days'),
  crossRuleMaxDays: document.querySelector('#cross-rule-max-days'),
  addCrossRule: document.querySelector('#add-cross-rule'),
  datasetIntegrity: document.querySelector('#dataset-integrity'),
  qualityReport: document.querySelector('#quality-report'),
  loadConnectedScenario: document.querySelector('#load-connected-scenario'),
  exportDatasetZip: document.querySelector('#export-dataset-zip'),
  scratchModeSummary: document.querySelector('#scratch-mode-summary'),
  basicDatasetRuleSummary: document.querySelector('#basic-dataset-rule-summary'),
  basicJourney: document.querySelector('#basic-journey'),
  basicStepGuidance: document.querySelector('#basic-step-guidance'),
  basicStepOneLabel: document.querySelector('#basic-step-one-label'),
  basicStepButtons: [...document.querySelectorAll('button[data-basic-step-target]')],
  quickTaskLabel: document.querySelector('#quick-task-label'),
  quickOutputRowCount: document.querySelector('#quick-output-row-count'),
  quickOutputColumnCount: document.querySelector('#quick-output-column-count'),
  quickSidebarNote: document.querySelector('#quick-sidebar-note'),
  advancedTaskLabel: document.querySelector('#advanced-task-label'),
  advancedOutputRowCount: document.querySelector('#advanced-output-row-count'),
  advancedOutputColumnCount: document.querySelector('#advanced-output-column-count'),
  quickPreviewSummary: document.querySelector('#quick-preview-summary'),
  quickPreviewColumnCount: document.querySelector('#quick-preview-column-count'),
  quickPreviewRowCount: document.querySelector('#quick-preview-row-count'),
  recoveryStatus: document.querySelector('#recovery-status'),
  undoConfig: document.querySelector('#undo-config'),
  clearWork: document.querySelector('#clear-work'),
});

const state = {
  workflow: 'IDLE',
  input: null,
  inputKind: null,
  inputSourcePreference: null,
  analysis: null,
  policies: [],
  relationships: [],
  outputPlan: null,
  outputSchema: null,
  sourceOutputSchema: null,
  generatedColumns: [],
  generatedColumnSequence: 0,
  workflowKind: 'TRANSFORM',
  templateId: null,
  templateBlockSequence: 0,
  personalFieldSets: [],
  scratchStructure: 'SINGLE',
  datasetTables: [],
  activeDatasetTableId: null,
  datasetTableSequence: 0,
  datasetResult: null,
  datasetPreviewProbe: false,
  pendingSourceConfig: null,
  requestedRowCount: 200,
  mode: 'SAFE_TEST_DATA',
  businessFidelity: DEFAULT_BUSINESS_FIDELITY,
  businessFidelitySettings: defaultBusinessFidelitySettings(DEFAULT_BUSINESS_FIDELITY),
  interfaceMode: 'BASIC',
  basicStep: 'INPUT',
  generatedColumnsExpanded: false,
  expandedGeneratedGroups: new Set(),
  generationResult: null,
  qualityReport: null,
  sourcePreview: null,
  previewMode: 'output',
  usingWorker: false,
  sizePolicy: null,
  messages: [createUiMessage('info', 'Choose a file or paste a small fictional table to begin.')],
};

let workerClient = null;
let quickSurface = null;
const RECOVERY_DRAFT_KEY = 'dummy-data-lab-safe-draft-v1';
const undoStack = [];
let draftSaveTimer = null;

function setWorkflow(next) {
  state.workflow = transitionWorkflow(state.workflow, next);
  const busy = next === 'ANALYSING' || next === 'GENERATING';
  elements.analyseButton.disabled = busy;
  updateGenerateAvailability();
  elements.cancelButton.hidden = !busy || !workerClient;
}

function showMessages() {
  renderMessages(elements.messages, state.messages);
}

function addMessage(kind, text, { replace = false, scope = null } = {}) {
  state.messages = [...mergeUiMessage(state.messages, createUiMessage(kind, text, scope), { replace })];
  showMessages();
}

function enhanceStaticInfoTooltips() {
  let sequence = 0;
  for (const tooltip of document.querySelectorAll('.info-tooltip[data-static-tooltip]')) {
    if (tooltip.dataset.tooltipEnhanced === 'true') continue;
    const content = tooltip.querySelector('.info-tooltip__content');
    if (!content) continue;
    sequence += 1;
    content.id ||= `static-info-tooltip-${sequence}`;
    tooltip.dataset.tooltipEnhanced = 'true';
    tooltip.setAttribute('aria-describedby', content.id);
    tooltip.setAttribute('aria-expanded', 'false');
    const setOpen = (open) => {
      tooltip.classList.toggle('is-open', open);
      tooltip.setAttribute('aria-expanded', String(open));
    };
    tooltip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!tooltip.classList.contains('is-open'));
    });
    tooltip.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        tooltip.focus();
      }
    });
  }
  document.addEventListener('click', () => {
    for (const tooltip of document.querySelectorAll('.info-tooltip.is-open')) {
      tooltip.classList.remove('is-open');
      tooltip.setAttribute('aria-expanded', 'false');
    }
  });
}

function progress(update, visible = true) {
  renderProgress(elements.progressPanel, update, visible);
}

workerClient = createInlineWorker({ onProgress: (update) => progress(update) });

function sizePolicyForInput(input) {
  const bytes = typeof input === 'string' ? estimateTextBytes(input) : Number(input?.size ?? 0);
  return classifyInputSize({ bytes });
}

function currentRequestedRowCount() {
  const selected = document.querySelector('input[name="row-count"]:checked');
  return resolveRequestedRowCount({ preset: selected?.value, customValue: elements.customRowCount.value });
}

function syncSameAsInputControl() {
  const model = sameAsInputModel(state.analysis?.parseResult?.rowCount ?? null);
  elements.sameAsInputRows.disabled = !model.available;
  elements.sameAsInputRows.textContent = model.label;
  elements.sameAsInputRows.title = model.note;
  elements.sameAsInputNote.textContent = model.note;
  if (model.available) elements.customRowCount.value = String(model.rowCount);
  return model;
}

function updateModeBoundary() {
  const descriptions = {
    SAFE_TEST_DATA: 'Protects identifiers while preserving useful patterns. Not an anonymisation guarantee.',
    ID_ONLY: 'Changes direct identifiers only. Indirect identifiers remain; the result is pseudonymised, not anonymous.',
    FULL_SYNTHETIC: 'Regenerates or resamples more values while preserving selected structure and relationships. It is still not an anonymity certification.',
  };
  elements.modeBoundary.textContent = descriptions[state.mode];
  elements.basicModeLabel.textContent = state.mode === 'ID_ONLY' ? 'ID Only' : 'Safe Test Data';
}

function renderBusinessFidelity() {
  const model = businessFidelityModel(state.businessFidelity, state.businessFidelitySettings);
  state.businessFidelity = model.level;
  state.businessFidelitySettings = model.settings;
  for (const input of elements.businessFidelityInputs) input.checked = input.value === model.level;
  for (const input of elements.businessFidelitySettings) {
    input.checked = Boolean(model.settings[input.dataset.fidelitySetting]);
  }
  elements.businessFidelityBoundary.textContent = model.boundary;
  elements.businessFidelityImpact.textContent = businessFidelityImpactModel({
    level: model.level,
    settings: model.settings,
    analysis: state.analysis,
    activeRelationshipCount: state.relationships.filter(relationshipIsActive).length,
  }).text;
  document.body.dataset.businessFidelity = model.level;
}

function basicReviewAvailable() {
  if (state.workflowKind === 'TRANSFORM') return Boolean(state.analysis);
  if (state.scratchStructure === 'MULTI') {
    return state.generatedColumns.length > 0 || state.datasetTables.some((table) => table.columns.length > 0);
  }
  return state.generatedColumns.length > 0;
}

function currentQuickColumnCount() {
  if (state.generationResult) return state.generationResult.headers.length;
  if (state.workflowKind === 'TRANSFORM') return state.analysis?.headers.length ?? 0;
  return state.generatedColumns.filter((column) => column.enabled !== false).length;
}

function renderQuickSummary() {
  const columnCount = currentQuickColumnCount();
  const generatedRowCount = state.generationResult?.rows.length ?? 0;
  const taskLabel = state.workflowKind === 'TRANSFORM' ? 'Transform existing data' : 'Generate one table';
  const advancedTaskLabel = state.workflowKind === 'TRANSFORM'
    ? 'Transform a table'
    : state.scratchStructure === 'MULTI'
      ? 'Generate related tables'
      : 'Generate from scratch';
  const notes = {
    INPUT: state.workflowKind === 'TRANSFORM'
      ? 'Add a source table. You will review the real column decisions before anything is generated.'
      : 'Choose a one-table template or add fields, then continue to review.',
    REVIEW: state.workflowKind === 'TRANSFORM'
      ? 'Check the output size and the highlighted column decisions, then generate.'
      : 'Check the fields and output size, then generate the complete fictional table.',
    RESULT: 'The preview is a scrollable window. The download always includes every generated column.',
  };
  if (elements.quickTaskLabel) elements.quickTaskLabel.textContent = taskLabel;
  if (elements.quickOutputRowCount) {
    elements.quickOutputRowCount.textContent = (generatedRowCount || state.requestedRowCount).toLocaleString();
  }
  if (elements.quickOutputColumnCount) {
    elements.quickOutputColumnCount.textContent = columnCount > 0 ? columnCount.toLocaleString() : 'After analysis';
  }
  if (elements.quickSidebarNote) elements.quickSidebarNote.textContent = notes[state.basicStep];
  if (elements.advancedTaskLabel) elements.advancedTaskLabel.textContent = advancedTaskLabel;
  if (elements.advancedOutputRowCount) {
    elements.advancedOutputRowCount.textContent = (generatedRowCount || state.requestedRowCount).toLocaleString();
  }
  if (elements.advancedOutputColumnCount) {
    elements.advancedOutputColumnCount.textContent = columnCount > 0 ? columnCount.toLocaleString() : 'After analysis';
  }
  if (elements.quickPreviewSummary) {
    elements.quickPreviewSummary.hidden = !state.generationResult;
    elements.quickPreviewColumnCount.textContent = columnCount.toLocaleString();
    elements.quickPreviewRowCount.textContent = generatedRowCount.toLocaleString();
  }
}

function renderBasicJourney() {
  if (!elements.basicJourney) return;
  const reviewAvailable = basicReviewAvailable();
  const resultAvailable = Boolean(state.generationResult);
  if (state.basicStep === 'RESULT' && !resultAvailable) state.basicStep = reviewAvailable ? 'REVIEW' : 'INPUT';
  if (state.basicStep === 'REVIEW' && !reviewAvailable) state.basicStep = 'INPUT';
  document.body.dataset.basicStep = state.basicStep;

  const labels = state.workflowKind === 'TRANSFORM'
    ? {
        one: 'Choose',
        INPUT: 'Choose a file or paste spreadsheet cells. Analysis stays in this browser.',
        REVIEW: 'Check the output size and the column decisions that need attention.',
        RESULT: 'Inspect the full-width preview and download every generated column.',
      }
    : {
        one: 'Choose',
        INPUT: 'Choose a one-table template or add the fields you need.',
        REVIEW: 'Adjust the fields and output size, then generate.',
        RESULT: 'Inspect the full-width preview and download every generated column.',
      };
  elements.basicStepOneLabel.textContent = labels.one;
  elements.basicStepGuidance.textContent = labels[state.basicStep];

  const order = ['INPUT', 'REVIEW', 'RESULT'];
  const activeIndex = order.indexOf(state.basicStep);
  for (const button of elements.basicStepButtons) {
    const step = button.dataset.basicStepTarget;
    const stepIndex = order.indexOf(step);
    const available = step === 'INPUT' || (step === 'REVIEW' && reviewAvailable) || (step === 'RESULT' && resultAvailable);
    button.disabled = !available;
    if (step === state.basicStep) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    if (stepIndex < activeIndex) button.dataset.stepStatus = 'complete';
    else delete button.dataset.stepStatus;
    const status = button.querySelector('small');
    if (status) {
      status.textContent = step === state.basicStep
        ? 'Current step'
        : stepIndex < activeIndex
          ? 'Completed · reopen'
          : available
            ? 'Ready'
            : step === 'REVIEW'
              ? 'Available after step 1'
              : 'Available after generation';
    }
  }
  renderQuickSummary();
}

function setBasicStep(step, { moveFocus = false } = {}) {
  if (!['INPUT', 'REVIEW', 'RESULT'].includes(step)) return;
  if (step === 'REVIEW' && !basicReviewAvailable()) return;
  if (step === 'RESULT' && !state.generationResult) return;
  state.basicStep = step;
  renderBasicJourney();
  if (state.interfaceMode !== 'BASIC') return;
  const target = step === 'INPUT'
    ? document.querySelector('.stage--input')
    : step === 'REVIEW'
      ? document.querySelector('.stage--plan')
      : document.querySelector('.stage--preview');
  globalThis.requestAnimationFrame(() => {
    if (target) {
      const scrollMarginTop = Number.parseFloat(globalThis.getComputedStyle(target).scrollMarginTop) || 0;
      globalThis.scrollTo({
        top: Math.max(0, globalThis.scrollY + target.getBoundingClientRect().top - scrollMarginTop),
        behavior: 'smooth',
      });
    }
    if (moveFocus && target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
}

function cloneRecoveryValue(value) {
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createRecoverySnapshot() {
  return cloneRecoveryValue({
    workflowKind: state.workflowKind,
    scratchStructure: state.scratchStructure,
    requestedRowCount: state.requestedRowCount,
    mode: state.mode,
    businessFidelity: state.businessFidelity,
    businessFidelitySettings: state.businessFidelitySettings,
    templateId: state.templateId,
    templateBlockSequence: state.templateBlockSequence,
    policies: state.policies,
    relationships: state.relationships,
    generatedColumns: state.generatedColumns,
    generatedColumnSequence: state.generatedColumnSequence,
    datasetTables: state.datasetTables,
    activeDatasetTableId: state.activeDatasetTableId,
    datasetTableSequence: state.datasetTableSequence,
  });
}

function updateRecoveryControls(message = null) {
  elements.undoConfig.disabled = undoStack.length === 0;
  elements.undoConfig.textContent = undoStack.length > 0 ? 'Undo last change (' + undoStack.length + ')' : 'Undo last change';
  if (message && elements.recoveryStatus) elements.recoveryStatus.textContent = message;
}

function recordUndoPoint(label = 'configuration change') {
  const snapshot = createRecoverySnapshot();
  const fingerprint = JSON.stringify(snapshot);
  if (undoStack.at(-1)?.fingerprint === fingerprint) return;
  undoStack.push({ snapshot, fingerprint, label });
  if (undoStack.length > 20) undoStack.shift();
  updateRecoveryControls();
}

function safeDraftPayload() {
  const payload = {
    version: 1,
    interfaceMode: state.interfaceMode,
    workflowKind: state.workflowKind,
    requestedRowCount: state.requestedRowCount,
    mode: state.mode,
    businessFidelity: state.businessFidelity,
    businessFidelitySettings: state.businessFidelitySettings,
    generatedColumns: state.generatedColumns,
    generatedColumnSequence: state.generatedColumnSequence,
  };
  if (state.workflowKind === 'SCRATCH') {
    payload.scratchStructure = state.scratchStructure;
    payload.templateId = state.templateId;
    payload.templateBlockSequence = state.templateBlockSequence;
    payload.datasetTables = state.datasetTables;
    payload.activeDatasetTableId = state.activeDatasetTableId;
    payload.datasetTableSequence = state.datasetTableSequence;
  }
  return payload;
}

function saveSafeDraft() {
  try {
    globalThis.sessionStorage?.setItem(RECOVERY_DRAFT_KEY, JSON.stringify(safeDraftPayload()));
    updateRecoveryControls('Settings saved in this tab.');
  } catch {
    updateRecoveryControls('Draft storage is unavailable. Undo still works in this page.');
  }
}

function scheduleSafeDraftSave() {
  globalThis.clearTimeout(draftSaveTimer);
  draftSaveTimer = globalThis.setTimeout(saveSafeDraft, 0);
}

function restoreSafeDraft() {
  try {
    const saved = globalThis.sessionStorage?.getItem(RECOVERY_DRAFT_KEY);
    if (!saved) return false;
    const draft = JSON.parse(saved);
    if (draft?.version !== 1) return false;
    if (['BASIC', 'ADVANCED'].includes(draft.interfaceMode)) state.interfaceMode = draft.interfaceMode;
    if (['TRANSFORM', 'SCRATCH'].includes(draft.workflowKind)) state.workflowKind = draft.workflowKind;
    if (Number.isInteger(draft.requestedRowCount) && draft.requestedRowCount > 0) {
      setRequestedRowControls(draft.requestedRowCount);
    }
    if (['SAFE_TEST_DATA', 'ID_ONLY'].includes(draft.mode)) state.mode = draft.mode;
    if (draft.businessFidelity) state.businessFidelity = draft.businessFidelity;
    if (draft.businessFidelitySettings) state.businessFidelitySettings = draft.businessFidelitySettings;
    if (Array.isArray(draft.generatedColumns)) state.generatedColumns = draft.generatedColumns;
    if (Number.isInteger(draft.generatedColumnSequence)) state.generatedColumnSequence = draft.generatedColumnSequence;
    if (state.workflowKind === 'SCRATCH') {
      state.scratchStructure = draft.scratchStructure === 'MULTI' ? 'MULTI' : 'SINGLE';
      state.templateId = draft.templateId ?? null;
      state.templateBlockSequence = Number.isInteger(draft.templateBlockSequence) ? draft.templateBlockSequence : 0;
      state.datasetTables = Array.isArray(draft.datasetTables) ? draft.datasetTables : [];
      state.activeDatasetTableId = draft.activeDatasetTableId ?? null;
      state.datasetTableSequence = Number.isInteger(draft.datasetTableSequence) ? draft.datasetTableSequence : 0;
      state.sourceOutputSchema = createSourceOutputSchema();
      state.workflow = 'READY';
      state.basicStep = state.generatedColumns.length > 0 ? 'REVIEW' : 'INPUT';
      syncOutputSchema();
    }
    document.body.dataset.workflowKind = state.workflowKind;
    document.body.dataset.scratchStructure = state.scratchStructure;
    elements.modeSelect.value = state.mode;
    for (const button of elements.workflowKindButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.workflowKind === state.workflowKind));
    }
    for (const button of elements.scratchStructureButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.scratchStructure === state.scratchStructure));
    }
    state.messages = [createUiMessage(
      'success',
      state.workflowKind === 'SCRATCH' && state.generatedColumns.length > 0
        ? 'Restored the fictional schema and settings from this tab.'
        : 'Restored your general settings from this tab. Re-add a source table to continue.',
      'RECOVERY_STATE',
    )];
    updateRecoveryControls('Settings restored from this tab.');
    return true;
  } catch {
    globalThis.sessionStorage?.removeItem(RECOVERY_DRAFT_KEY);
    updateRecoveryControls('The previous draft could not be restored. A new safe draft will be created.');
    return false;
  }
}

function restoreRecoverySnapshot(entry) {
  const snapshot = cloneRecoveryValue(entry.snapshot);
  Object.assign(state, snapshot);
  document.body.dataset.workflowKind = state.workflowKind;
  document.body.dataset.scratchStructure = state.scratchStructure;
  elements.modeSelect.value = state.mode;
  setRequestedRowControls(state.requestedRowCount);
  for (const button of elements.workflowKindButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.workflowKind === state.workflowKind));
  }
  for (const button of elements.scratchStructureButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.scratchStructure === state.scratchStructure));
  }
  state.sourceOutputSchema = state.workflowKind === 'SCRATCH'
    ? createSourceOutputSchema()
    : state.analysis
      ? createSourceOutputSchema({ headers: state.analysis.headers, detections: state.analysis.detections })
      : null;
  if (state.sourceOutputSchema) syncOutputSchema();
  state.workflow = state.workflowKind === 'SCRATCH' || state.analysis ? 'READY' : 'IDLE';
  invalidateGeneratedResult();
  updateModeBoundary();
  renderBusinessFidelity();
  renderTemplatePicker();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  if (state.analysis && state.workflowKind === 'TRANSFORM') {
    renderPolicyArea();
    renderRelationships();
  }
  updateGenerateAvailability();
  renderInterfaceMode();
  renderBasicJourney();
  scheduleSafeDraftSave();
  addMessage('success', 'Undid ' + entry.label + '. Review the restored settings before generating again.', { replace: true, scope: 'RECOVERY_STATE' });
}

function recoveryMutationTarget(event) {
  const control = event.target.closest?.('button, input, select, textarea');
  if (!control || !control.closest('.stage')) return null;
  if (control.matches([
    '#file-input', '#paste-input', '#analyse-button', '#generate-button', '#advanced-regenerate', '#probe-button',
    '#export-csv', '#export-tsv', '#export-dataset-zip', '#compare-toggle', '#review-confirm', '#excel-safe',
    '#review-generated-columns', '[data-workflow-kind]', '[data-basic-step-target]',
    '.info-tooltip', '.policy-list-controls *', '.policy-pagination *',
  ].join(', '))) return null;
  return control;
}

function prepareRecoveryForMutation(event) {
  const control = recoveryMutationTarget(event);
  if (!control) return;
  const label = control.getAttribute('aria-label')
    || control.id?.replaceAll('-', ' ')
    || control.textContent?.trim().slice(0, 50)
    || 'configuration change';
  recordUndoPoint(label);
  scheduleSafeDraftSave();
}

function renderInterfaceMode() {
  const model = interfaceModeModel(state.interfaceMode);
  document.body.dataset.interfaceMode = model.mode;
  if (state.sourceOutputSchema) syncOutputSchema();
  for (const button of elements.interfaceModeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.interfaceMode === model.mode));
  }
  if (elements.inputOptions) {
    const headerNeedsReview = requiresHeaderConfirmation(state.analysis?.parseResult);
    elements.inputOptions.open = headerNeedsReview;
  }
  if (state.analysis) renderPolicyArea();
  renderGeneratorCatalog();
  renderGeneratedColumns();
  renderBasicJourney();
}

function renderGeneratedColumnsDisclosure() {
  const canCollapse = state.interfaceMode === 'ADVANCED' && state.workflowKind === 'TRANSFORM';
  const expanded = !canCollapse || state.generatedColumnsExpanded;
  elements.generatedColumnsPanel.hidden = !expanded;
  elements.generatedColumnsToggle.setAttribute('aria-expanded', String(expanded));
  elements.generatedColumnsToggle.textContent = expanded ? 'Hide fields' : 'Add fields';
}

function setGeneratedColumnsExpanded(expanded) {
  state.generatedColumnsExpanded = Boolean(expanded);
  renderGeneratedColumnsDisclosure();
}

function generatedGroupId(column) {
  return column?.blockId || 'custom-fields';
}

function focusLatestGeneratedGroup(columns = state.generatedColumns) {
  const latest = columns.at(-1);
  state.expandedGeneratedGroups = new Set(latest ? [generatedGroupId(latest)] : []);
}

function renderTemplateSelectionSummary() {
  const groups = new Map();
  for (const column of state.generatedColumns) {
    const label = column.blockLabel || 'Custom';
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  elements.templateSelectionSummary.hidden = state.generatedColumns.length === 0;
  if (state.generatedColumns.length === 0) {
    elements.templateSelectionText.textContent = '';
    return;
  }
  const groupText = [...groups].map(([label, count]) => `${label} ${count}`).join(' · ');
  elements.templateSelectionText.textContent = `Selected: ${groupText} · ${state.generatedColumns.length} columns total`;
}

function reviewGeneratedColumns() {
  setGeneratedColumnsExpanded(true);
  if (state.interfaceMode === 'BASIC') setBasicStep('REVIEW');
  elements.generatedColumnsWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  elements.generatedColumnsWorkspace.classList.remove('is-attention');
  globalThis.requestAnimationFrame(() => elements.generatedColumnsWorkspace.classList.add('is-attention'));
  globalThis.setTimeout(() => elements.generatedColumnsWorkspace.classList.remove('is-attention'), 900);
}

function reviewIsRequired() {
  if (state.workflowKind === 'SCRATCH') return false;
  return state.mode === 'ID_ONLY'
    || state.policies.some((policy) => policy.reviewRequired)
    || state.policies.some((policy) => policy.riskLevel === 'HIGH' && policy.selectedAction === 'KEEP');
}

function currentUnconfiguredShifts() {
  if (!state.analysis) return Object.freeze([]);
  return findUnconfiguredShiftPolicies({ policies: state.policies, relationshipRules: state.relationships });
}

function updateGenerateAvailability() {
  const busy = state.workflow === 'ANALYSING' || state.workflow === 'GENERATING';
  const sourceMissing = state.workflowKind === 'TRANSFORM' && !state.analysis;
  const headerAmbiguous = state.workflowKind === 'TRANSFORM' && requiresHeaderConfirmation(state.analysis?.parseResult);
  const schemaMissing = state.workflowKind === 'SCRATCH'
    ? state.scratchStructure === 'MULTI'
      ? state.datasetTables.length === 0 || state.datasetTables.some((table) => table.id === state.activeDatasetTableId
          ? state.generatedColumns.length === 0
          : table.columns.length === 0)
      : state.generatedColumns.length === 0
    : false;
  const headerBlocked = state.workflowKind === 'TRANSFORM'
    ? sourceMissing || headerAmbiguous
    : state.scratchStructure === 'MULTI'
      ? state.datasetTables.length === 0 || state.datasetTables.some((table) => table.id === state.activeDatasetTableId
          ? state.generatedColumns.length === 0
          : table.columns.length === 0)
      : state.generatedColumns.length === 0;
  const unconfiguredShifts = state.analysis ? currentUnconfiguredShifts() : [];
  const shiftBlocked = unconfiguredShifts.length > 0;
  const reviewCount = state.policies.filter((policy) => policy.reviewRequired
    || (policy.riskLevel === 'HIGH' && policy.selectedAction === 'KEEP')).length;
  const requiresReview = reviewIsRequired();
  const reviewPending = requiresReview && !elements.reviewConfirm.checked;
  elements.reviewConfirmation.hidden = !requiresReview;
  elements.generateButton.disabled = busy || headerBlocked || shiftBlocked;
  elements.probeButton.disabled = busy || headerBlocked || shiftBlocked;
  let heading = 'Ready to generate';
  const generationCost = currentGenerationCost();
  let detail = `${state.requestedRowCount.toLocaleString()} rows will be created locally.`;
  if (generationCost.requiresConfirmation) {
    detail = `Large local job: about ${generationCost.estimatedCells.toLocaleString()} cells. You will confirm before it starts.`;
  }
  let readinessState = 'READY';
  if (busy) {
    heading = state.workflow === 'ANALYSING' ? 'Analysing your table' : 'Generating dummy data';
    detail = 'You can continue when this local task finishes.';
    readinessState = 'WORKING';
  } else if (sourceMissing) {
    heading = 'Add and analyse a source table';
    detail = 'Recommendations appear after local analysis.';
    readinessState = 'BLOCKED';
  } else if (schemaMissing) {
    heading = 'Choose at least one field';
    detail = 'Add a template or field before generating.';
    readinessState = 'BLOCKED';
  } else if (headerAmbiguous) {
    heading = 'Confirm the header row';
    detail = 'Choose Yes or No under Input options, then analyse again.';
    readinessState = 'BLOCKED';
  } else if (shiftBlocked) {
    heading = `${unconfiguredShifts.length} shift setting${unconfiguredShifts.length === 1 ? '' : 's'} still needed`;
    detail = `Set an explicit offset for ${unconfiguredShifts.map((entry) => entry.columnName).join(', ')}.`;
    readinessState = 'BLOCKED';
  } else if (reviewPending) {
    heading = `${Math.max(1, reviewCount)} review notice${Math.max(1, reviewCount) === 1 ? '' : 's'}`;
    detail = 'Review is recommended, but generation and download remain available.';
    readinessState = 'REVIEW';
  }
  elements.generationReadiness.dataset.state = readinessState;
  elements.generationReadiness.querySelector('strong').textContent = heading;
  elements.generationReadiness.querySelector('small').textContent = detail;
}

function currentGenerationCost() {
  if (state.workflowKind === 'SCRATCH' && state.scratchStructure === 'MULTI') {
    const tables = currentScratchTablesForSummary().map((table) => ({
      rowCount: table.rowCount ?? state.requestedRowCount,
      columnCount: table.columns.filter((column) => column.enabled !== false).length,
    }));
    return estimateGenerationCost({ requestedRowCount: state.requestedRowCount, tables });
  }
  const generatedColumnCount = generatedColumnsForCurrentSurface().filter((column) => column.enabled !== false).length;
  const sourceColumnCount = state.workflowKind === 'TRANSFORM'
    ? state.policies.length > 0
      ? state.policies.filter((policy) => policy.selectedAction !== 'DROP').length
      : state.sourceOutputSchema?.columns.length ?? 0
    : 0;
  return estimateGenerationCost({
    requestedRowCount: state.requestedRowCount,
    columnCount: sourceColumnCount + generatedColumnCount,
  });
}

function confirmFormulaRiskExport(risks, context = 'this export') {
  const summary = formulaRiskSummary(risks);
  if (summary.total === 0) return true;
  const parts = [];
  if (summary.headerCount > 0) parts.push(`${summary.headerCount} ${summary.headerCount === 1 ? 'header' : 'headers'}`);
  if (summary.dataCellCount > 0) parts.push(`${summary.dataCellCount} data ${summary.dataCellCount === 1 ? 'cell' : 'cells'}`);
  return globalThis.confirm(`${context} contains ${parts.join(' and ')} that spreadsheet software may interpret as formulas. Formula protection is off. Continue without protection?`);
}

function invalidateGeneratedResult() {
  state.generationResult = null;
  state.datasetResult = null;
  state.datasetPreviewProbe = false;
  state.sourcePreview = null;
  state.previewMode = 'output';
  elements.exportCsv.disabled = true;
  elements.exportTsv.disabled = true;
  elements.exportDatasetZip.disabled = true;
  elements.advancedRegenerate.disabled = true;
  elements.previewControls.hidden = true;
  elements.compareToggle.disabled = true;
  elements.compareToggle.textContent = 'Compare with source';
  elements.previewTable.classList.add('empty-panel');
  elements.previewTable.textContent = 'Generate again to preview the current rules.';
  renderGenerationValidation(elements.generationValidation, null);
  elements.datasetPreviewTabs.hidden = true;
  elements.datasetPreviewTabs.replaceChildren();
  renderDatasetIntegrity(elements.datasetIntegrity, null);
  state.qualityReport = null;
  renderQualityReport(elements.qualityReport, null);
  if (state.basicStep === 'RESULT') state.basicStep = basicReviewAvailable() ? 'REVIEW' : 'INPUT';
  renderBasicJourney();
}

function renderResultQualityReport({ generationResult, datasetResult = null, probe = false }) {
  const report = createQualityReport({
    analysis: state.workflowKind === 'TRANSFORM' ? state.analysis : null,
    policies: state.workflowKind === 'TRANSFORM' ? state.policies : [],
    relationshipRules: state.workflowKind === 'TRANSFORM' ? state.relationships : [],
    generationResult,
    datasetResult,
    probe,
  });
  state.qualityReport = report;
  renderQualityReport(elements.qualityReport, report, {
    onDownload: (currentReport) => downloadJson(serializeQualityReport(currentReport), {
      filename: `dummy-data-quality-report-${APP_RELEASE.version}.json`,
    }),
  });
}

function commitActiveDatasetTable() {
  if (state.scratchStructure !== 'MULTI' || !state.activeDatasetTableId) return;
  state.datasetTables = state.datasetTables.map((table) => table.id === state.activeDatasetTableId
    ? createDatasetTable({ ...table, columns: state.generatedColumns })
    : table);
}

function syncOutputSchema() {
  if (!state.sourceOutputSchema) return;
  state.outputSchema = combineOutputSchema(state.sourceOutputSchema, generatedColumnsForCurrentSurface());
  commitActiveDatasetTable();
}

function generatedColumnsForCurrentSurface() {
  return state.interfaceMode === 'BASIC' && state.workflowKind === 'TRANSFORM'
    ? Object.freeze([])
    : state.generatedColumns;
}

function reindexGeneratedColumns(columns) {
  const offset = state.sourceOutputSchema?.columns.length ?? 0;
  return columns.map((column, index) => Object.freeze({ ...column, position: offset + index }));
}

function currentScratchTablesForSummary() {
  if (state.scratchStructure !== 'MULTI') return [];
  return state.datasetTables.map((table) => table.id === state.activeDatasetTableId
    ? Object.freeze({ ...table, columns: Object.freeze([...state.generatedColumns]) })
    : table);
}

function renderScratchModeSummary() {
  const tables = currentScratchTablesForSummary();
  const summary = scratchAdvancedSummary({ tables, activeColumns: state.generatedColumns });
  elements.scratchModeSummary.replaceChildren();
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  const description = document.createElement('span');
  if (summary.hasAdvancedRules) {
    title.textContent = 'Advanced rules stay active';
    description.textContent = `${summary.parts.join(' · ')}. Basic keeps them running but hides their editing controls.`;
  } else {
    title.textContent = 'Basic uses safe defaults';
    description.textContent = 'Rename fields, choose a type, then test or generate. Advanced adds ranges, blanks, uniqueness, dependencies, and saved sets.';
  }
  const badge = document.createElement('b');
  badge.textContent = summary.hasAdvancedRules ? `${summary.activeRuleCount} ACTIVE` : 'BASIC';
  copy.append(title, description);
  elements.scratchModeSummary.append(copy, badge);

  elements.basicDatasetRuleSummary.replaceChildren();
  if (state.scratchStructure === 'MULTI') {
    const datasetTitle = document.createElement('strong');
    datasetTitle.textContent = `${summary.tableCount} linked tables · ${summary.columnCount} fields`;
    const datasetText = document.createElement('span');
    datasetText.textContent = summary.hasAdvancedRules
      ? `Managed automatically: ${summary.parts.join(' · ')}. Switch to Advanced only when you need to change these links.`
      : 'No table links are configured yet. Advanced can add keys and relationship rules.';
    elements.basicDatasetRuleSummary.append(datasetTitle, datasetText);
  }
}

function renderGeneratedColumns() {
  renderGeneratedColumnsDisclosure();
  const activeTable = state.scratchStructure === 'MULTI'
    ? state.datasetTables.find((table) => table.id === state.activeDatasetTableId) ?? null
    : null;
  const protectedColumnIds = basicProtectedColumnIds({ table: activeTable, columns: state.generatedColumns });
  renderGeneratedColumnEditor(elements.generatedColumnEditor, state.generatedColumns, {
    onChange(columnId, changes) {
      invalidateGeneratedResult();
      state.generatedColumns = state.generatedColumns.map((column) => column.id === columnId
        ? Object.freeze({ ...column, ...changes, settings: column.settings })
        : column);
      syncOutputSchema();
    },
    onTypeChange(columnId, generatorType) {
      invalidateGeneratedResult();
      state.generatedColumns = state.generatedColumns.map((column) => column.id === columnId
        ? Object.freeze({ ...column, generatorType, settings: Object.freeze(defaultGeneratorSettings(generatorType)) })
        : column);
      syncOutputSchema();
      renderGeneratedColumns();
    },
    onSettingsChange(columnId, changes) {
      invalidateGeneratedResult();
      state.generatedColumns = state.generatedColumns.map((column) => column.id === columnId
        ? Object.freeze({ ...column, settings: Object.freeze({ ...column.settings, ...changes }) })
        : column);
      syncOutputSchema();
      renderGeneratedColumns();
    },
    onMove(columnId, direction) {
      const currentIndex = state.generatedColumns.findIndex((column) => column.id === columnId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.generatedColumns.length) return;
      const reordered = [...state.generatedColumns];
      [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
      state.generatedColumns = reindexGeneratedColumns(reordered);
      invalidateGeneratedResult();
      syncOutputSchema();
      renderGeneratedColumns();
    },
    onDuplicate(columnId) {
      const currentIndex = state.generatedColumns.findIndex((column) => column.id === columnId);
      if (currentIndex < 0) return;
      state.generatedColumnSequence += 1;
      const source = state.generatedColumns[currentIndex];
      const copy = Object.freeze({
        ...source,
        id: `generated-user-${state.generatedColumnSequence}`,
        name: `${source.name} copy`,
        settings: Object.freeze({ ...source.settings }),
      });
      const duplicated = [...state.generatedColumns];
      duplicated.splice(currentIndex + 1, 0, copy);
      state.generatedColumns = reindexGeneratedColumns(duplicated);
      invalidateGeneratedResult();
      syncOutputSchema();
      renderGeneratedColumns();
      renderTemplatePicker();
    },
    onRemove(columnId) {
      const removed = state.generatedColumns.find((column) => column.id === columnId);
      invalidateGeneratedResult();
      state.generatedColumns = reindexGeneratedColumns(state.generatedColumns.filter((column) => column.id !== columnId));
      if (removed && !state.generatedColumns.some((column) => generatedGroupId(column) === generatedGroupId(removed))) {
        state.expandedGeneratedGroups.delete(generatedGroupId(removed));
      }
      syncOutputSchema();
      renderGeneratedColumns();
      renderTemplatePicker();
      addMessage('info', 'Removed the generated column.', { scope: 'GENERATED_COLUMNS' });
    },
    onGroupToggle(blockId, open) {
      if (open) state.expandedGeneratedGroups.add(blockId);
      else state.expandedGeneratedGroups.delete(blockId);
    },
  }, state.outputSchema?.columns ?? state.generatedColumns, {
    interfaceMode: state.interfaceMode,
    protectedColumnIds,
    expandedBlockIds: [...state.expandedGeneratedGroups],
  });
  renderScratchModeSummary();
  renderTemplateSelectionSummary();
  renderQuickSummary();
}

const GENERATOR_FIELD_NAMES = Object.freeze({
  'person-name': 'person_name', email: 'email', phone: 'phone', address: 'address',
  integer: 'quantity', decimal: 'amount', boolean: 'is_active', category: 'status',
  date: 'date', datetime: 'created_at', sequence: 'record_id', uuid: 'uuid',
  constant: 'constant_value', 'copy-column': 'copied_value', template: 'formatted_value',
  'date-after': 'follow_up_date',
});

const GENERATOR_SEARCH_TERMS = Object.freeze({
  'person-name': 'name customer people person 姓名 客户 人员', email: 'mail contact 邮箱 邮件',
  phone: 'mobile telephone contact 电话 手机', address: 'location street 地址',
  integer: 'number count quantity whole 数量 整数', decimal: 'money price amount currency 金额 小数 价格',
  boolean: 'yes no true false flag 布尔 是否', category: 'choice status enum 分类 状态',
  date: 'day calendar 日期', datetime: 'timestamp time created 日期时间 时间',
  sequence: 'id code serial identifier 编号 序号', uuid: 'guid identifier 唯一标识',
  constant: 'fixed same text 常量 固定', 'copy-column': 'dependent copy reference 复制 依赖',
  template: 'dependent prefix suffix format 模板 前缀 后缀', 'date-after': 'dependent later follow up 之后 跟进',
});

function uniqueGeneratedName(baseName) {
  const occupied = new Set(state.generatedColumns.map((column) => column.name.toLowerCase()));
  let candidate = baseName;
  let suffix = 2;
  while (occupied.has(candidate.toLowerCase())) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function nextGeneratedSequence() {
  do state.generatedColumnSequence += 1;
  while (state.generatedColumns.some((column) => column.id === `generated-user-${state.generatedColumnSequence}`));
  return state.generatedColumnSequence;
}

function addGeneratedColumnOfType(generatorType = 'person-name') {
  const sequence = nextGeneratedSequence();
  const position = (state.sourceOutputSchema?.columns.length ?? 0) + state.generatedColumns.length;
  const baseName = GENERATOR_FIELD_NAMES[generatorType] ?? `new_column_${sequence}`;
  state.generatedColumns = [...state.generatedColumns, newGeneratedColumn(sequence, position, generatorType, uniqueGeneratedName(baseName))];
  state.expandedGeneratedGroups = new Set(['custom-fields']);
  syncOutputSchema();
  renderGeneratedColumns();
  invalidateGeneratedResult();
  updateGenerateAvailability();
  const label = providerCatalog.getGenerator(generatorType).label;
  addMessage('success', `Added ${label}. Rename it or adjust its settings whenever you need.`, { scope: 'GENERATED_COLUMNS' });
}

function renderGeneratorCatalog() {
  const query = elements.generatorSearch.value.trim().toLowerCase();
  const matches = providerCatalog.listGenerators().filter((generator) => {
    if (['foreign-key', 'lookup-foreign', 'date-after-foreign'].includes(generator.id)) return false;
    if (state.interfaceMode === 'BASIC' && !BASIC_QUICK_ADD_IDS.includes(generator.id)) return false;
    const haystack = `${generator.id} ${generator.label} ${generator.category} ${GENERATOR_SEARCH_TERMS[generator.id] ?? ''}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  elements.generatorCatalog.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement('small');
    empty.textContent = 'No field types match that search.';
    elements.generatorCatalog.append(empty);
    return;
  }
  for (const generator of matches) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'generator-chip';
    control.textContent = `+ ${generator.label}`;
    const category = document.createElement('small');
    category.textContent = generator.category;
    control.append(category);
    control.addEventListener('click', () => addGeneratedColumnOfType(generator.id));
    elements.generatorCatalog.append(control);
  }
}

function persistPersonalFieldSets() {
  globalThis.localStorage.setItem(PERSONAL_FIELD_SETS_KEY, serializePersonalFieldSets(state.personalFieldSets));
}

function renderPersonalFieldSets(selectedId = elements.personalSetPicker.value) {
  elements.personalSetPicker.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.personalFieldSets.length ? 'Choose a saved set' : 'No saved sets';
  elements.personalSetPicker.append(placeholder);
  for (const set of state.personalFieldSets) {
    const option = document.createElement('option');
    option.value = set.id;
    option.textContent = `${set.name} (${set.columns.length})`;
    option.selected = set.id === selectedId;
    elements.personalSetPicker.append(option);
  }
  const hasSelection = Boolean(elements.personalSetPicker.value);
  elements.loadPersonalSet.disabled = !hasSelection;
  elements.deletePersonalSet.disabled = !hasSelection;
}

function restorePersonalFieldSets() {
  try {
    state.personalFieldSets = [...parsePersonalFieldSets(globalThis.localStorage.getItem(PERSONAL_FIELD_SETS_KEY))];
  } catch {
    state.personalFieldSets = [];
    addMessage('warning', 'Saved personal field sets could not be read, so the library started empty.', { scope: 'PERSONAL_SETS' });
  }
  renderPersonalFieldSets();
}

function savePersonalFieldSet() {
  try {
    const set = createPersonalFieldSet({ name: elements.personalSetName.value, columns: state.generatedColumns });
    state.personalFieldSets = [...upsertPersonalFieldSet(state.personalFieldSets, set)];
    persistPersonalFieldSets();
    renderPersonalFieldSets(set.id);
    elements.personalSetName.value = '';
    addMessage('success', `Saved “${set.name}” in this browser. It contains ${set.columns.length} field definitions and no row data.`, { scope: 'PERSONAL_SETS' });
  } catch (error) {
    addMessage('error', `Field set not saved: ${error.message}`, { scope: 'PERSONAL_SETS' });
  }
}

function loadPersonalFieldSet() {
  const set = state.personalFieldSets.find((entry) => entry.id === elements.personalSetPicker.value);
  if (!set) return;
  state.generatedColumns = reindexGeneratedColumns(set.columns.map((column) => Object.freeze({ ...column, settings: Object.freeze({ ...column.settings }) })));
  state.generatedColumnSequence = Math.max(state.generatedColumnSequence, state.generatedColumns.length);
  focusLatestGeneratedGroup();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('success', `Loaded “${set.name}” with ${set.columns.length} fields.`, { scope: 'PERSONAL_SETS' });
}

function deletePersonalFieldSet() {
  const set = state.personalFieldSets.find((entry) => entry.id === elements.personalSetPicker.value);
  if (!set) return;
  state.personalFieldSets = [...removePersonalFieldSet(state.personalFieldSets, set.id)];
  try { persistPersonalFieldSets(); } catch {}
  renderPersonalFieldSets();
  addMessage('info', `Deleted the saved field set “${set.name}”.`, { scope: 'PERSONAL_SETS' });
}

function renderTemplatePicker() {
  elements.templatePicker.replaceChildren();
  for (const template of listDatasetTemplates()) {
    const matchingColumns = template.id === 'blank'
      ? []
      : state.generatedColumns.filter((column) => column.blockLabel === template.label);
    const blockCount = new Set(matchingColumns.map((column) => column.blockId)).size;
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'template-card';
    control.dataset.templateId = template.id;
    control.dataset.count = String(blockCount);
    control.setAttribute('aria-pressed', String(template.id === 'blank' ? state.generatedColumns.length === 0 : blockCount > 0));
    if (template.id !== 'blank') control.setAttribute('aria-label', `${blockCount > 0 ? 'Add another' : 'Add'} ${template.label} block`);
    const title = document.createElement('strong');
    title.textContent = template.id === 'blank'
      ? 'Clear all'
      : blockCount > 0 ? `✓ ${template.label} · ${blockCount}` : `+ ${template.label}`;
    const description = document.createElement('small');
    description.textContent = blockCount > 0
      ? `${matchingColumns.length} fields added · Add another block`
      : template.description;
    control.append(title, description);
    control.addEventListener('click', () => {
      state.templateId = null;
      state.sourceOutputSchema = createSourceOutputSchema();
      if (template.id === 'blank') {
        state.generatedColumns = [];
        state.templateBlockSequence = 0;
        state.expandedGeneratedGroups.clear();
      } else {
        state.templateBlockSequence += 1;
        const appended = appendDatasetTemplateBlock({
          existingColumns: state.generatedColumns,
          templateId: template.id,
          blockSequence: state.templateBlockSequence,
        });
        state.generatedColumns = reindexGeneratedColumns([...state.generatedColumns, ...appended]);
        state.expandedGeneratedGroups = new Set(appended[0]?.blockId ? [appended[0].blockId] : []);
      }
      syncOutputSchema();
      invalidateGeneratedResult();
      renderTemplatePicker();
      renderGeneratedColumns();
      updateGenerateAvailability();
      addMessage('success', template.id === 'blank'
        ? 'Cleared the standalone schema. Add a block or create a column to continue.'
        : `Added the ${template.label} block. You can add another block or edit any column.`, { replace: true, scope: 'SCRATCH_STATE' });
    });
    elements.templatePicker.append(control);
  }
  renderTemplateSelectionSummary();
}

function nextDatasetTableName() {
  const occupied = new Set(state.datasetTables.map((table) => table.name.toLowerCase()));
  let number = state.datasetTables.length + 1;
  while (occupied.has(`table ${number}`)) number += 1;
  return `Table ${number}`;
}

function renderDatasetWorkspace() {
  for (const control of elements.scratchStructureButtons) {
    control.setAttribute('aria-pressed', String(control.dataset.scratchStructure === state.scratchStructure));
  }
  document.body.dataset.scratchStructure = state.scratchStructure;
  elements.datasetTableTabs.replaceChildren();
  for (const table of state.datasetTables) {
    const control = document.createElement('button');
    control.type = 'button';
    control.role = 'tab';
    control.className = 'dataset-table-tab';
    control.textContent = `${table.name} · ${table.columns.length}`;
    control.setAttribute('aria-selected', String(table.id === state.activeDatasetTableId));
    control.addEventListener('click', () => switchDatasetTable(table.id));
    elements.datasetTableTabs.append(control);
  }
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  elements.datasetTableName.value = active?.name ?? '';
  elements.datasetTableName.disabled = !active;
  elements.deleteDatasetTable.disabled = state.datasetTables.length <= 1;

  const previousPrimary = elements.datasetPrimaryKey.value;
  elements.datasetPrimaryKey.replaceChildren();
  const noPrimary = document.createElement('option');
  noPrimary.value = '';
  noPrimary.textContent = 'Not selected';
  elements.datasetPrimaryKey.append(noPrimary);
  for (const column of active?.columns.filter((entry) => entry.enabled !== false && entry.generatorType !== 'foreign-key') ?? []) {
    const option = document.createElement('option');
    option.value = column.id;
    option.textContent = column.name;
    option.selected = column.id === active.primaryKeyColumnId;
    elements.datasetPrimaryKey.append(option);
  }
  if (!active?.primaryKeyColumnId && previousPrimary === '') noPrimary.selected = true;
  elements.datasetPrimaryKey.disabled = !active;

  elements.datasetForeignTarget.replaceChildren();
  const noTarget = document.createElement('option');
  noTarget.value = '';
  noTarget.textContent = 'Choose a table with a primary key';
  elements.datasetForeignTarget.append(noTarget);
  for (const target of state.datasetTables.filter((table) => table.id !== active?.id && table.primaryKeyColumnId)) {
    const primary = target.columns.find((column) => column.id === target.primaryKeyColumnId);
    if (!primary) continue;
    const option = document.createElement('option');
    option.value = `${target.id}|${primary.id}`;
    option.textContent = `${target.name}.${primary.name}`;
    elements.datasetForeignTarget.append(option);
  }
  elements.addForeignKey.disabled = elements.datasetForeignTarget.options.length <= 1;
  const foreignKeys = active?.columns.filter((column) => column.generatorType === 'foreign-key') ?? [];
  elements.datasetKeySummary.textContent = active?.primaryKeyColumnId
    ? `${active.name} has a primary key and ${foreignKeys.length} foreign key${foreignKeys.length === 1 ? '' : 's'}. Foreign-key values are sampled only from generated parent keys.`
    : 'Select a stable unique column as this table\'s primary key.';
  elements.datasetCardinalityRules.replaceChildren();
  for (const foreignKey of foreignKeys) {
    const row = document.createElement('div');
    row.className = 'cardinality-rule';
    const title = document.createElement('strong');
    title.textContent = `${foreignKey.name} → ${foreignKey.settings.targetTableName}.${foreignKey.settings.targetColumnName}`;
    const driverLabel = document.createElement('label');
    const driver = document.createElement('input');
    driver.type = 'checkbox';
    driver.checked = foreignKey.settings.cardinalityMode === 'DRIVER';
    driver.addEventListener('change', () => updateForeignKeyCardinality(foreignKey.id, { cardinalityMode: driver.checked ? 'DRIVER' : 'SAMPLE' }));
    driverLabel.append(driver, document.createTextNode(' Controls child row count'));
    const minimumLabel = document.createElement('label');
    minimumLabel.textContent = 'Min / parent';
    const minimum = document.createElement('input');
    minimum.type = 'number'; minimum.min = '0'; minimum.max = '1000'; minimum.step = '1';
    minimum.value = String(foreignKey.settings.minimumPerParent ?? 0);
    minimum.disabled = !driver.checked;
    minimum.addEventListener('change', () => updateForeignKeyCardinality(foreignKey.id, { minimumPerParent: Number(minimum.value) }));
    minimumLabel.append(minimum);
    const maximumLabel = document.createElement('label');
    maximumLabel.textContent = 'Max / parent';
    const maximum = document.createElement('input');
    maximum.type = 'number'; maximum.min = '1'; maximum.max = '1000'; maximum.step = '1';
    maximum.value = String(foreignKey.settings.maximumPerParent ?? 5);
    maximum.disabled = !driver.checked;
    maximum.addEventListener('change', () => updateForeignKeyCardinality(foreignKey.id, { maximumPerParent: Number(maximum.value) }));
    maximumLabel.append(maximum);
    row.append(title, driverLabel, minimumLabel, maximumLabel);
    elements.datasetCardinalityRules.append(row);
  }
  renderCrossRuleBuilder();
}

function renderCrossRuleBuilder() {
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  const previous = elements.crossRuleForeignKey.value;
  elements.crossRuleForeignKey.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose link';
  elements.crossRuleForeignKey.append(placeholder);
  for (const foreignKey of active?.columns.filter((column) => column.generatorType === 'foreign-key') ?? []) {
    const option = document.createElement('option');
    option.value = foreignKey.id;
    option.textContent = `${foreignKey.name} → ${foreignKey.settings.targetTableName}`;
    option.selected = foreignKey.id === previous;
    elements.crossRuleForeignKey.append(option);
  }
  refreshCrossRuleParentColumns();
}

function refreshCrossRuleParentColumns() {
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  const foreignKey = active?.columns.find((column) => column.id === elements.crossRuleForeignKey.value);
  const target = state.datasetTables.find((table) => table.id === foreignKey?.settings.targetTableId);
  const kind = elements.crossRuleKind.value;
  elements.crossRuleParentColumn.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose parent field';
  elements.crossRuleParentColumn.append(placeholder);
  const eligible = target?.columns.filter((column) => column.enabled !== false
    && (kind !== 'date-after-foreign' || ['date', 'date-after', 'date-after-foreign'].includes(column.generatorType))) ?? [];
  for (const column of eligible) {
    const option = document.createElement('option');
    option.value = column.id;
    option.textContent = `${target.name}.${column.name}`;
    elements.crossRuleParentColumn.append(option);
  }
  const dateMode = kind === 'date-after-foreign';
  document.querySelectorAll('.cross-date-setting').forEach((control) => { control.hidden = !dateMode; });
  elements.addCrossRule.disabled = !foreignKey || eligible.length === 0;
}

function addCrossTableRuleColumn() {
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  const foreignKey = active?.columns.find((column) => column.id === elements.crossRuleForeignKey.value);
  const target = state.datasetTables.find((table) => table.id === foreignKey?.settings.targetTableId);
  const targetColumn = target?.columns.find((column) => column.id === elements.crossRuleParentColumn.value);
  if (!active || !foreignKey || !target || !targetColumn) {
    addMessage('error', 'Choose a foreign key and a parent field for the linked rule.', { scope: 'CROSS_TABLE_RULE' });
    return;
  }
  const generatorType = elements.crossRuleKind.value;
  const sequence = nextGeneratedSequence();
  const baseName = elements.crossRuleName.value.trim()
    || (generatorType === 'date-after-foreign' ? `${targetColumn.name}_after` : targetColumn.name);
  const created = newGeneratedColumn(sequence, state.generatedColumns.length, generatorType, uniqueGeneratedName(baseName));
  const linked = Object.freeze({
    ...created,
    settings: Object.freeze({
      ...created.settings,
      foreignKeyColumnId: foreignKey.id,
      targetTableId: target.id,
      targetColumnId: targetColumn.id,
      targetTableName: target.name,
      targetColumnName: targetColumn.name,
      minimumDays: Number(elements.crossRuleMinDays.value),
      maximumDays: Number(elements.crossRuleMaxDays.value),
    }),
  });
  state.generatedColumns = [...state.generatedColumns, linked];
  elements.crossRuleName.value = '';
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('success', generatorType === 'date-after-foreign'
    ? `Added ${linked.name}: ${elements.crossRuleMinDays.value}–${elements.crossRuleMaxDays.value} days after ${target.name}.${targetColumn.name} for the linked parent.`
    : `Added ${linked.name}: copied from ${target.name}.${targetColumn.name} by ${foreignKey.name}.`, { scope: 'CROSS_TABLE_RULE' });
}

function updateForeignKeyCardinality(columnId, changes) {
  state.generatedColumns = state.generatedColumns.map((column) => {
    if (column.generatorType !== 'foreign-key') return column;
    const settings = { ...column.settings };
    if (changes.cardinalityMode === 'DRIVER' && column.id !== columnId) settings.cardinalityMode = 'SAMPLE';
    if (column.id === columnId) Object.assign(settings, changes);
    return Object.freeze({ ...column, settings: Object.freeze(settings) });
  });
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  const updated = state.generatedColumns.find((column) => column.id === columnId);
  addMessage('info', updated?.settings.cardinalityMode === 'DRIVER'
    ? `${updated.name} now controls child rows: ${updated.settings.minimumPerParent ?? 0}–${updated.settings.maximumPerParent ?? 5} per parent.`
    : `${updated?.name ?? 'Foreign key'} now samples parent keys without controlling the table row count.`, { scope: 'DATASET_CARDINALITY' });
}

function setActivePrimaryKey(columnId) {
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  if (!active) return;
  if (!columnId) {
    const referenced = state.datasetTables.some((table) => table.columns.some((column) => column.generatorType === 'foreign-key'
      && column.settings?.targetTableId === active.id));
    if (referenced) {
      elements.datasetPrimaryKey.value = active.primaryKeyColumnId ?? '';
      addMessage('error', `Remove foreign keys pointing to ${active.name} before clearing its primary key.`, { scope: 'DATASET_KEYS' });
      return;
    }
  }
  state.generatedColumns = state.generatedColumns.map((column) => column.id === columnId
    ? Object.freeze({ ...column, settings: Object.freeze({ ...column.settings, unique: true, nullRate: 0 }) })
    : column);
  state.datasetTables = state.datasetTables.map((table) => table.id === active.id
    ? createDatasetTable({ ...table, columns: state.generatedColumns, primaryKeyColumnId: columnId || null })
    : table);
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('success', columnId
    ? `Primary key set for ${active.name}. Uniqueness and non-blank rules are enforced.`
    : `Primary key cleared for ${active.name}.`, { scope: 'DATASET_KEYS' });
}

function addForeignKeyColumn() {
  const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  const [targetTableId, targetColumnId] = elements.datasetForeignTarget.value.split('|');
  const target = state.datasetTables.find((table) => table.id === targetTableId);
  const targetColumn = target?.columns.find((column) => column.id === targetColumnId);
  if (!active || !target || !targetColumn) return;
  const sequence = nextGeneratedSequence();
  const position = state.generatedColumns.length;
  const created = newGeneratedColumn(sequence, position, 'foreign-key', uniqueGeneratedName(targetColumn.name));
  const hasDriver = state.generatedColumns.some((column) => column.generatorType === 'foreign-key' && column.settings?.cardinalityMode === 'DRIVER');
  const foreignKey = Object.freeze({
    ...created,
    settings: Object.freeze({
      ...created.settings,
      nullRate: 0,
      unique: false,
      targetTableId: target.id,
      targetColumnId: targetColumn.id,
      targetTableName: target.name,
      targetColumnName: targetColumn.name,
      cardinalityMode: hasDriver ? 'SAMPLE' : 'DRIVER',
      minimumPerParent: hasDriver ? 0 : 1,
      maximumPerParent: 5,
    }),
  });
  state.generatedColumns = [...state.generatedColumns, foreignKey];
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('success', `Added ${foreignKey.name}, linked to ${target.name}.${targetColumn.name}.`, { scope: 'DATASET_KEYS' });
}

function addDatasetTable({ columns = [], name = nextDatasetTableName() } = {}) {
  commitActiveDatasetTable();
  state.datasetTableSequence += 1;
  const table = createDatasetTable({ id: `dataset-table-${state.datasetTableSequence}`, name, columns });
  state.datasetTables = [...state.datasetTables, table];
  state.activeDatasetTableId = table.id;
  state.generatedColumns = [...table.columns];
  state.sourceOutputSchema = createSourceOutputSchema();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  return table;
}

function switchDatasetTable(tableId) {
  if (tableId === state.activeDatasetTableId) return;
  commitActiveDatasetTable();
  const table = state.datasetTables.find((entry) => entry.id === tableId);
  if (!table) return;
  state.activeDatasetTableId = table.id;
  state.generatedColumns = [...table.columns];
  state.sourceOutputSchema = createSourceOutputSchema();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('info', `Editing ${table.name}. Template blocks and quick-added fields now go to this table.`, { scope: 'DATASET_TABLE' });
}

function setScratchStructure(structure) {
  if (!['SINGLE', 'MULTI'].includes(structure) || structure === state.scratchStructure) return;
  if (structure === 'MULTI' && state.datasetTables.length === 0) {
    state.datasetTableSequence += 1;
    const first = createDatasetTable({
      id: `dataset-table-${state.datasetTableSequence}`,
      name: 'Table 1',
      columns: state.generatedColumns,
    });
    state.datasetTables = [first];
    state.activeDatasetTableId = first.id;
  }
  if (structure === 'MULTI') {
    state.scratchStructure = structure;
    const active = state.datasetTables.find((table) => table.id === state.activeDatasetTableId) ?? state.datasetTables[0];
    state.activeDatasetTableId = active.id;
    state.generatedColumns = [...active.columns];
  } else {
    commitActiveDatasetTable();
    state.scratchStructure = structure;
  }
  state.sourceOutputSchema = createSourceOutputSchema();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('info', structure === 'MULTI'
    ? 'Related-tables workspace is active. Add tables, choose primary keys, and configure links before generating the project.'
    : 'One-table mode is active. The selected table fields remain available as one wide dataset.', { replace: true, scope: 'DATASET_STRUCTURE' });
}

function renameActiveDatasetTable(name) {
  const current = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  if (!current) return;
  try {
    const renamed = createDatasetTable({ ...current, name, columns: state.generatedColumns });
    const duplicate = state.datasetTables.some((table) => table.id !== current.id && table.name.toLowerCase() === renamed.name.toLowerCase());
    if (duplicate) throw new RangeError(`Table name “${renamed.name}” is already used.`);
    state.datasetTables = state.datasetTables.map((table) => {
      if (table.id === current.id) return renamed;
      const columns = table.columns.map((column) => column.settings?.targetTableId === current.id
        ? Object.freeze({ ...column, settings: Object.freeze({ ...column.settings, targetTableName: renamed.name }) })
        : column);
      return createDatasetTable({ ...table, columns });
    });
    invalidateGeneratedResult();
    renderDatasetWorkspace();
    updateGenerateAvailability();
  } catch (error) {
    elements.datasetTableName.value = current.name;
    addMessage('error', error.message, { scope: 'DATASET_TABLE' });
  }
}

function deleteActiveDatasetTable() {
  if (state.datasetTables.length <= 1) return;
  const removed = state.datasetTables.find((table) => table.id === state.activeDatasetTableId);
  const remaining = state.datasetTables.filter((table) => table.id !== state.activeDatasetTableId);
  state.datasetTables = remaining;
  state.activeDatasetTableId = remaining[0].id;
  state.generatedColumns = [...remaining[0].columns];
  state.sourceOutputSchema = createSourceOutputSchema();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('info', `Deleted ${removed.name}.`, { scope: 'DATASET_TABLE' });
}

function renderDatasetPreviewTabs(selectedId = state.activeDatasetTableId) {
  elements.datasetPreviewTabs.replaceChildren();
  const results = state.datasetResult?.tableResults ?? [];
  elements.datasetPreviewTabs.hidden = results.length === 0;
  for (const table of results) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'dataset-table-tab';
    control.textContent = `${table.name} · ${table.generationResult.rows.length.toLocaleString()} rows`;
    control.setAttribute('aria-selected', String(table.id === selectedId));
    control.addEventListener('click', () => {
      state.generationResult = table.generationResult;
      state.outputPlan = table.outputPlan;
      renderDatasetPreviewTabs(table.id);
      renderCurrentPreview();
      renderGenerationValidation(elements.generationValidation, table.generationResult, { hidePassing: true });
      const exportAllowed = isGeneratedResultDownloadable({
        generationResult: table.generationResult,
        probe: state.datasetPreviewProbe,
      });
      elements.exportCsv.disabled = !exportAllowed;
      elements.exportTsv.disabled = !exportAllowed;
    });
    elements.datasetPreviewTabs.append(control);
  }
}

function loadConnectedScenario() {
  const hasExistingWork = state.generatedColumns.length > 0 || state.datasetTables.some((table) => table.columns.length > 0);
  if (hasExistingWork && !globalThis.confirm('Replace the current scratch schema with the connected four-table scenario?')) return;
  const scenario = createConnectedCommerceScenario();
  state.scratchStructure = 'MULTI';
  state.datasetTables = [...scenario.tables];
  state.datasetTableSequence = scenario.tables.length;
  state.activeDatasetTableId = scenario.activeTableId;
  state.generatedColumns = [...scenario.tables.find((table) => table.id === scenario.activeTableId).columns];
  focusLatestGeneratedGroup();
  state.sourceOutputSchema = createSourceOutputSchema();
  state.templateId = null;
  state.templateBlockSequence = 0;
  syncOutputSchema();
  invalidateGeneratedResult();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('success', `Built ${scenario.name}: 4 tables with primary keys, foreign keys, children-per-parent rules, copied values, and linked dates.`, { replace: true, scope: 'DATASET_SCENARIO' });
}

function exportDatasetZip() {
  try {
    commitActiveDatasetTable();
    const prepared = prepareDatasetArchive({
      tables: state.datasetTables,
      datasetResult: state.datasetResult,
      appVersion: APP_RELEASE.version,
      projectConfig: currentGenerationConfig(),
      excelSafe: elements.excelSafe.checked,
    });
    if (!elements.excelSafe.checked
      && !confirmFormulaRiskExport(prepared.formulaRisks, 'This project export')) return;
    const downloaded = downloadDatasetArchive(prepared);
    addMessage('success', `Downloaded ${downloaded.filename} with ${downloaded.fileCount} files: all table CSVs, manifest, reusable project config, and README.`, { scope: 'DATASET_EXPORT' });
  } catch (error) {
    addMessage('error', `Project ZIP not downloaded: ${error.message}`, { scope: 'DATASET_EXPORT' });
  }
}

function setWorkflowKind(kind) {
  if (!['TRANSFORM', 'SCRATCH'].includes(kind) || kind === state.workflowKind) return;
  state.workflowKind = kind;
  state.basicStep = 'INPUT';
  document.body.dataset.workflowKind = kind;
  for (const button of elements.workflowKindButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.workflowKind === kind));
  }
  invalidateGeneratedResult();
  if (kind === 'SCRATCH') {
    state.sourceOutputSchema = createSourceOutputSchema();
    syncOutputSchema();
    if (state.workflow === 'IDLE') setWorkflow('READY');
    addMessage('info', 'Generate a complete fictional table locally. Choose a template or start blank.', { replace: true, scope: 'WORKFLOW_KIND' });
  } else {
    if (state.analysis) {
      state.sourceOutputSchema = createSourceOutputSchema({ headers: state.analysis.headers, detections: state.analysis.detections });
      syncOutputSchema();
    }
    addMessage('info', 'Transform mode is ready. Choose or paste a table, then analyse it locally.', { replace: true, scope: 'WORKFLOW_KIND' });
  }
  renderGeneratedColumns();
  updateGenerateAvailability();
  renderBasicJourney();
  scheduleSafeDraftSave();
}

function setRequestedRowControls(rowCount) {
  const preset = document.querySelector(`input[name="row-count"][value="${rowCount}"]`);
  if (preset) {
    preset.checked = true;
    elements.customRowCount.disabled = true;
  } else {
    elements.customRowPreset.checked = true;
    elements.customRowCount.disabled = false;
    elements.customRowCount.value = String(rowCount);
  }
  state.requestedRowCount = rowCount;
}

function sourceConfigMatches(headers, sourceConfig) {
  return Array.isArray(sourceConfig?.headers)
    && headers.length === sourceConfig.headers.length
    && headers.every((header, index) => header === sourceConfig.headers[index]);
}

function applyPendingSourceConfig() {
  const pending = state.pendingSourceConfig;
  if (!pending || !state.analysis) return false;
  if (!sourceConfigMatches(state.analysis.headers, pending)) {
    addMessage('warning', 'The saved source-column rules were not applied because this table has different column names or order. Generated columns were still restored.', { scope: 'CONFIG_SOURCE' });
    return false;
  }
  const policiesCompatible = pending.policies.length === state.analysis.headers.length
    && pending.policies.every((policy, index) => policy?.columnName === state.analysis.headers[index]);
  if (!policiesCompatible) {
    addMessage('warning', 'The saved source-column rules are incomplete for this table, so the current recommendations remain active.', { scope: 'CONFIG_SOURCE' });
    return false;
  }
  state.policies = pending.policies.map((policy, index) => Object.freeze({
    ...state.analysis.policies[index],
    ...policy,
    attributeRole: policy.attributeRole ?? state.analysis.policies[index].attributeRole,
    attributeRoleConfidence: policy.attributeRoleConfidence ?? state.analysis.policies[index].attributeRoleConfidence,
    attributeRoleReason: policy.attributeRoleReason ?? state.analysis.policies[index].attributeRoleReason,
    attributeRoleSource: policy.attributeRoleSource ?? state.analysis.policies[index].attributeRoleSource,
    inferredAttributeRole: state.analysis.policies[index].inferredAttributeRole,
    inferredAttributeRoleConfidence: state.analysis.policies[index].inferredAttributeRoleConfidence,
    inferredAttributeRoleReason: state.analysis.policies[index].inferredAttributeRoleReason,
  }));
  state.relationships = [...pending.relationships];
  state.pendingSourceConfig = null;
  addMessage('success', 'Restored the saved source-column decisions after confirming an exact header match.', { scope: 'CONFIG_SOURCE' });
  return true;
}

function exportConfiguration() {
  try {
    const config = currentGenerationConfig();
    const downloaded = downloadJson(serializeGenerationConfig(config), { filename: `dummy-data-config-${APP_RELEASE.version}.json` });
    addMessage('success', `Downloaded ${downloaded.filename}. It contains rules and column definitions, never source rows.`, { scope: 'CONFIG_STATE' });
  } catch (error) {
    addMessage('error', error.message, { scope: 'CONFIG_STATE' });
  }
}

function currentGenerationConfig() {
  commitActiveDatasetTable();
  return createGenerationConfig({
    appVersion: APP_RELEASE.version,
    workflowKind: state.workflowKind,
    requestedRowCount: currentRequestedRowCount(),
    mode: state.mode,
    businessFidelity: state.businessFidelity,
    businessFidelitySettings: state.businessFidelitySettings,
    templateId: state.templateId,
    generatedColumns: state.generatedColumns,
    generatedColumnSequence: state.generatedColumnSequence,
    scratchStructure: state.scratchStructure,
    datasetTables: state.scratchStructure === 'MULTI' ? state.datasetTables : [],
    activeDatasetTableId: state.activeDatasetTableId,
    datasetTableSequence: state.datasetTableSequence,
    templateBlockSequence: state.templateBlockSequence,
    sourceHeaders: state.analysis?.headers ?? [],
    policies: state.workflowKind === 'TRANSFORM' ? state.policies : [],
    relationships: state.workflowKind === 'TRANSFORM' ? state.relationships : [],
  });
}

async function importConfiguration(file) {
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new RangeError('Configuration files must be 1 MB or smaller.');
    const config = parseGenerationConfig(await file.text());
    if (config.workflowKind !== state.workflowKind) setWorkflowKind(config.workflowKind);
    state.templateId = config.templateId;
    state.mode = config.mode;
    elements.modeSelect.value = config.mode;
    state.businessFidelity = config.businessFidelity;
    state.businessFidelitySettings = config.businessFidelitySettings;
    setRequestedRowControls(config.requestedRowCount);
    state.pendingSourceConfig = config.workflowKind === 'TRANSFORM' ? config.source : null;
    if (state.workflowKind === 'SCRATCH') {
      state.scratchStructure = config.scratch?.structure ?? 'SINGLE';
      state.datasetTables = state.scratchStructure === 'MULTI' ? [...config.scratch.tables] : [];
      state.activeDatasetTableId = state.scratchStructure === 'MULTI' ? config.scratch.activeTableId : null;
      state.datasetTableSequence = state.scratchStructure === 'MULTI' ? config.scratch.tableSequence : 0;
      state.templateBlockSequence = config.scratch?.templateBlockSequence ?? 0;
      const activeTable = state.datasetTables.find((table) => table.id === state.activeDatasetTableId) ?? state.datasetTables[0] ?? null;
      state.generatedColumns = state.scratchStructure === 'MULTI' ? [...(activeTable?.columns ?? [])] : [...config.generatedColumns];
      state.generatedColumnSequence = config.generatedColumnSequence;
      state.sourceOutputSchema = createSourceOutputSchema();
      document.body.dataset.scratchStructure = state.scratchStructure;
      for (const button of elements.scratchStructureButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.scratchStructure === state.scratchStructure));
      }
    } else {
      state.generatedColumns = [...config.generatedColumns];
      state.generatedColumnSequence = config.generatedColumnSequence;
      if (state.analysis) state.sourceOutputSchema = createSourceOutputSchema({ headers: state.analysis.headers, detections: state.analysis.detections });
    }
    focusLatestGeneratedGroup();
    syncOutputSchema();
    invalidateGeneratedResult();
    applyPendingSourceConfig();
    updateModeBoundary();
    renderBusinessFidelity();
    renderTemplatePicker();
    renderDatasetWorkspace();
    renderGeneratedColumns();
    if (state.analysis && state.workflowKind === 'TRANSFORM') {
      renderPolicyArea();
      renderRelationships();
    }
    updateGenerateAvailability();
    scheduleSafeDraftSave();
    const configKind = config.workflowKind === 'TRANSFORM'
      ? 'table-transform'
      : config.scratch?.structure === 'MULTI'
        ? 'related-table project'
        : 'standalone';
    addMessage('success', `Loaded a ${configKind} configuration created with ${config.appVersion}.`, { replace: true, scope: 'CONFIG_STATE' });
  } catch (error) {
    addMessage('error', `Configuration not loaded: ${error.message}`, { replace: true, scope: 'CONFIG_STATE' });
  } finally {
    elements.configFile.value = '';
  }
}

function renderPolicyArea() {
  elements.policyTable.classList.remove('empty-panel');
  const unconfiguredShifts = currentUnconfiguredShifts();
  renderShiftReadiness(elements.shiftReadiness, unconfiguredShifts, (offsets) => {
    try {
      invalidateGeneratedResult();
      state.policies = [...applySuggestedShiftOffsets({
        policies: state.policies,
        relationshipRules: state.relationships,
        ...offsets,
      })];
      elements.reviewConfirm.checked = false;
      renderPolicyArea();
      addMessage('success', 'Applied explicit fixed offsets to every listed SHIFT column. Review the values, then confirm and generate.', { scope: 'POLICY_STATE' });
    } catch (error) {
      addMessage('error', error.message, { scope: 'POLICY_STATE' });
    }
  });
  const actionPreviews = buildActionPreviews({
    headers: state.analysis.headers,
    profiles: state.analysis.tableProfile.columns,
    detections: state.analysis.detections,
    policies: state.policies,
    relationshipRules: state.relationships.filter(relationshipIsActive),
    businessFidelity: state.businessFidelity,
    businessFidelitySettings: state.businessFidelitySettings,
  });
  renderPolicyTable(elements.policyTable, {
    profiles: state.analysis.tableProfile.columns,
    detections: state.analysis.detections,
    policies: state.policies,
    actionPreviews,
    businessFidelityLabel: businessFidelityModel(state.businessFidelity, state.businessFidelitySettings).label,
    interfaceMode: state.interfaceMode,
  }, {
    onActionChange(columnIndex, action) {
      invalidateGeneratedResult();
      state.policies = [...updatePolicyAction({ policies: state.policies, detections: state.analysis.detections, columnIndex, action })];
      elements.reviewConfirm.checked = false;
      renderPolicyArea();
      const policy = state.policies[columnIndex];
      if (policy.riskLevel === 'HIGH' && policy.selectedAction === 'KEEP') {
        addMessage('warning', `High-risk KEEP selected for ${policy.columnName}. The source value will be retained. Review is recommended, but generation and download remain available.`, { scope: 'POLICY_STATE' });
      } else if (policy.selectedAction === 'SHIFT') {
        addMessage('warning', `SHIFT selected for ${policy.columnName}. Enter an explicit offset before generating.`, { scope: 'POLICY_STATE' });
      } else {
        addMessage('info', `Updated ${policy.columnName} to ${policy.selectedAction}.`, { scope: 'POLICY_STATE' });
      }
    },
    onParamsChange(columnIndex, params) {
      invalidateGeneratedResult();
      state.policies = [...updatePolicyActionParams({ policies: state.policies, columnIndex, params })];
      elements.reviewConfirm.checked = false;
      renderPolicyArea();
      addMessage('info', `Updated settings for ${state.policies[columnIndex].columnName}.`, { scope: 'POLICY_STATE' });
    },
    onRoleChange(columnIndex, role) {
      invalidateGeneratedResult();
      state.policies = [...updatePolicyAttributeRole({ policies: state.policies, columnIndex, role })];
      renderPolicyArea();
      const policy = state.policies[columnIndex];
      addMessage('info', `Set ${policy.columnName} to ${policy.attributeRole.replaceAll('_', ' ').toLocaleLowerCase()}. Final Action is still ${policy.selectedAction}.`, { scope: 'POLICY_ROLE' });
    },
    onRequestAdvanced() {
      state.interfaceMode = 'ADVANCED';
      renderInterfaceMode();
      addMessage('info', interfaceModeModel(state.interfaceMode).description, { scope: 'INTERFACE_MODE' });
    },
  });
  updateGenerateAvailability();
}

function renderRelationships() {
  renderMappingGroupBuilder(elements.mappingGroupBuilder, {
    headers: state.analysis.headers,
    policies: state.policies,
  }, (configuration) => {
    try {
      if (configuration.columnNames.length < 2) throw new RangeError('Select at least two columns for a Consistent Mapping Group.');
      const id = `user-mapping-group-${state.relationships.length + 1}`;
      invalidateGeneratedResult();
      state.relationships = [...addMappingGroup(state.relationships, { id, ...configuration })];
      for (const columnName of configuration.columnNames) {
        const columnIndex = state.analysis.headers.indexOf(columnName);
        state.policies = [...updatePolicyActionParams({
          policies: state.policies,
          columnIndex,
          params: { repeatHandling: 'CONSISTENT' },
        })];
      }
      elements.reviewConfirm.checked = false;
      renderPolicyArea();
      renderRelationships();
      addMessage('success', `Enabled consistent mapping for ${configuration.columnNames.join(', ')}.`, { scope: 'RELATIONSHIP_STATE' });
    } catch (error) {
      addMessage('error', error.message, { scope: 'RELATIONSHIP_STATE' });
    }
  });
  renderShiftGroupBuilder(elements.shiftGroupBuilder, {
    headers: state.analysis.headers,
    detections: state.analysis.detections,
  }, (configuration) => {
    try {
      if (configuration.columnNames.length < 2) throw new RangeError('Select at least two compatible columns for a Shift Group.');
      const id = `user-shift-group-${state.relationships.length + 1}`;
      invalidateGeneratedResult();
      state.relationships = [...addShiftGroup(state.relationships, { id, ...configuration })];
      const added = state.relationships.at(-1);
      for (const columnName of configuration.columnNames) {
        const columnIndex = state.analysis.headers.indexOf(columnName);
        state.policies = [...updatePolicyAction({
          policies: state.policies,
          detections: state.analysis.detections,
          columnIndex,
          action: 'SHIFT',
        })];
        state.policies = [...updatePolicyActionParams({
          policies: state.policies,
          columnIndex,
          params: { ...added.options, groupId: added.id },
        })];
      }
      elements.reviewConfirm.checked = false;
      renderPolicyArea();
      renderRelationships();
      addMessage('success', `Enabled ${added.kind} for ${added.columnNames.join(', ')}.`, { scope: 'RELATIONSHIP_STATE' });
    } catch (error) {
      addMessage('error', error.message, { scope: 'RELATIONSHIP_STATE' });
    }
  });
  elements.relationshipPanel.classList.remove('empty-panel');
  renderRelationshipPanel(elements.relationshipPanel, state.relationships, (index, enabled) => {
    invalidateGeneratedResult();
    state.relationships = [...setRelationshipEnabled(state.relationships, index, enabled)];
    elements.reviewConfirm.checked = false;
    renderPolicyArea();
    renderRelationships();
    const rule = state.relationships[index];
    const isShiftGroup = ['DATE_TIME_SHIFT_GROUP', 'NUMBER_SEQUENCE_SHIFT_GROUP'].includes(rule.kind);
    const message = !enabled && isShiftGroup
      ? `Disabled ${rule.kind}. Its shared offset/order rule is off; the affected columns still keep their individual Final Actions.`
      : `${enabled ? 'Confirmed' : 'Disabled'} relationship ${rule.kind}.`;
    addMessage('info', message, { scope: 'RELATIONSHIP_STATE' });
  });
  renderBusinessFidelity();
}

function renderAnalysis() {
  renderParseSummary(elements.parseSummary, state.analysis.parseResult, state.analysis.headers.length);
  renderCoverageSummary(elements.coverageSummary, state.outputPlan);
  renderBusinessFidelity();
  renderPolicyArea();
  renderRelationships();
  updateGenerateAvailability();
  elements.reviewConfirm.checked = false;
  elements.previewTable.classList.add('empty-panel');
  elements.previewTable.textContent = 'Generated data will appear here.';
  elements.exportCsv.disabled = true;
  elements.exportTsv.disabled = true;
  elements.previewControls.hidden = true;
  elements.compareToggle.disabled = true;
}

function prepareComparisonControls() {
  const comparisonAvailable = state.generationResult.sourcePreviewReferences.length > 0;
  elements.previewControls.hidden = false;
  elements.compareControls.hidden = !comparisonAvailable;
  elements.compareToggle.disabled = !comparisonAvailable;
  elements.compareToggle.textContent = 'Compare with source';
  state.sourcePreview = null;
  state.previewMode = 'output';
}

function renderCurrentPreview() {
  if (!state.generationResult) return;
  elements.previewTable.classList.remove('empty-panel');
  if (state.previewMode === 'comparison' && state.sourcePreview) {
    renderInlineComparisonTable(elements.previewTable, {
      generationResult: state.generationResult,
      sourcePreview: state.sourcePreview,
    }, { noteContainer: elements.previewRowNote });
    return;
  }
  renderPreviewTable(elements.previewTable, state.generationResult, { noteContainer: elements.previewRowNote });
}

async function toggleSourceComparison() {
  if (!state.generationResult) return;
  if (state.previewMode === 'comparison') {
    state.previewMode = 'output';
    elements.compareToggle.textContent = 'Compare with source';
    renderCurrentPreview();
    return;
  }
  try {
    elements.compareToggle.disabled = true;
    if (!state.sourcePreview) {
      addMessage('info', 'Loading a limited source comparison locally…', { scope: 'COMPARISON_STATE' });
      const sourceRowIndexes = state.generationResult.sourcePreviewReferences
        .map((entry) => entry.sourceRowIndex)
        .filter((value) => Number.isInteger(value) && value >= 0);
      const response = state.usingWorker
        ? await workerClient.compare({ sourceRowIndexes })
        : { sourcePreview: await collectSourceComparison({
            input: state.input,
            parseOptions: state.analysis.parseOptions,
            sourceRowIndexes,
            expectedHeaders: state.analysis.headers,
          }) };
      state.sourcePreview = response.sourcePreview;
    }
    state.previewMode = 'comparison';
    elements.compareToggle.textContent = 'Show output only';
    renderCurrentPreview();
    addMessage('success', 'Source comparison is ready. Original values remain local and are not included in downloads.', { replace: true, scope: 'COMPARISON_STATE' });
  } catch (error) {
    addMessage('error', error?.message ?? 'The source comparison could not be prepared.', { replace: true, scope: 'COMPARISON_STATE' });
  } finally {
    elements.compareToggle.disabled = false;
  }
}

async function analyse(inputOverride = null) {
  try {
    const pastedText = inputOverride?.pastedText ?? elements.pasteInput.value;
    const selected = selectInputValue({
      file: inputOverride?.file ?? elements.fileInput.files?.[0] ?? null,
      pastedText,
      sourcePreference: inputOverride?.sourcePreference ?? state.inputSourcePreference,
      pastedTextIsSample: inputOverride?.pastedTextIsSample ?? isTransformSampleText(pastedText),
    });
    const parseOptions = parseOptionsFromControls({
      delimiterMode: elements.delimiterMode.value,
      customDelimiter: elements.customDelimiter.value,
      headerMode: elements.headerMode.value,
      inputKind: selected.inputKind,
    });
    const recognitionAllowlist = parseRecognitionAllowlist(elements.recognitionAllowlist?.value ?? '');
    state.input = selected.input;
    state.inputKind = selected.inputKind;
    state.sizePolicy = sizePolicyForInput(selected.input);
    state.requestedRowCount = currentRequestedRowCount();
    state.generationResult = null;
    if (state.workflow === 'IDLE' || state.workflow === 'READY' || state.workflow === 'GENERATED' || state.workflow === 'ERROR') setWorkflow('ANALYSING');
    addMessage('info', `Analysing ${selected.sourceLabel} locally…`, { replace: true });
    for (const warning of state.sizePolicy.warnings) addMessage('warning', warning);
    if (workerClient) {
      const response = await workerClient.analyse({
        input: state.input,
        parseOptions,
        recognitionOptions: { allowlist: recognitionAllowlist },
        requestedRowCount: state.requestedRowCount,
      });
      state.analysis = response.analysis;
      state.usingWorker = true;
    } else {
      assertSafeFallback(state.sizePolicy);
      state.analysis = await analyseInput({
        input: state.input,
        parseOptions,
        recognitionOptions: { allowlist: recognitionAllowlist },
        requestedRowCount: state.requestedRowCount,
        onProgress: (update) => progress(update),
      });
      state.usingWorker = false;
    }
    state.policies = [...state.analysis.policies];
    state.relationships = [...state.analysis.relationshipProposals];
    const recognitionSummary = state.analysis.recognitionSummary;
    if ((recognitionSummary?.recognisedAustralianIdentifierColumnCount ?? 0) > 0) {
      addMessage('warning', `${recognitionSummary.recognisedAustralianIdentifierColumnCount} Australian identifier column${recognitionSummary.recognisedAustralianIdentifierColumnCount === 1 ? '' : 's'} passed format and checksum recognition. Review the protective actions before generating.`, { scope: 'PII_RECOGNITION' });
    } else if ((recognitionSummary?.allowlistedValueCount ?? 0) > 0) {
      addMessage('info', `${recognitionSummary.allowlistedValueCount} in-memory PII allowlist value${recognitionSummary.allowlistedValueCount === 1 ? '' : 's'} were applied during recognition.`, { scope: 'PII_RECOGNITION' });
    }
    applyPendingSourceConfig();
    state.outputPlan = state.analysis.outputPlan;
    state.sourceOutputSchema = createSourceOutputSchema({
      headers: state.analysis.headers,
      detections: state.analysis.detections,
    });
    syncOutputSchema();
    const exactStructure = businessFidelityModel(state.businessFidelity, state.businessFidelitySettings).requiresInputRowCount;
    if (exactStructure) elements.customRowPreset.checked = true;
    const inputCount = syncSameAsInputControl();
    if (elements.customRowPreset.checked && inputCount.available) {
      elements.customRowCount.disabled = false;
      state.requestedRowCount = inputCount.rowCount;
      state.outputPlan = state.usingWorker
        ? (await workerClient.replan({ requestedRowCount: state.requestedRowCount })).outputPlan
        : replanCoverage(state.analysis, state.requestedRowCount);
    }
    elements.keepAllButton.disabled = false;
    elements.applyRecommendationsButton.disabled = false;
    setWorkflow('READY');
    state.basicStep = 'REVIEW';
    renderAnalysis();
    renderBasicJourney();
    progress({ phase: 'READY', message: 'Analysis complete.', current: 1, total: 1 }, false);
    addMessage('success', `Analysis complete: ${state.analysis.parseResult.rowCount.toLocaleString()} input rows, ${state.analysis.headers.length} columns, ${state.analysis.extraction.scenarios.length} test scenarios.`, { replace: true });
    if (state.analysis.parseResult.headerDetection.autoFallback) {
      if (state.analysis.parseResult.headerDetection.decision === 'yes') {
        addMessage('warning', 'Header Auto-detect was uncertain, but the title evidence was stronger, so the first row was used as column names. If those values are actually data, choose No under Input options and analyse again.');
      } else {
        addMessage('info', 'Header Auto-detect was uncertain, so the safer fallback kept the first row as data. If it is actually a title row, choose Yes under Input options and analyse again.');
      }
    } else if (state.analysis.parseResult.headerDetection.decision === 'ambiguous') {
      elements.inputOptions.open = true;
      addMessage('error', 'Generation is blocked because the header is ambiguous. Choose Yes or No under Header row, then analyse again.');
    }
    if (state.analysis.parseResult.issues.length > 0) {
      addMessage('warning', `${state.analysis.parseResult.issues.length} parsing or decoding issues were recorded. Review the parse summary before generating.`);
    }
    const notice = coverageNotice(state.outputPlan);
    if (notice) addMessage('warning', notice, { scope: 'COVERAGE_STATE' });
    return true;
  } catch (error) {
    if (state.workflow === 'ANALYSING') setWorkflow(error?.code === 'PIPELINE_CANCELLED' ? 'IDLE' : 'ERROR');
    progress({ phase: 'ERROR', message: 'Analysis stopped.' }, false);
    addMessage(error?.code === 'PIPELINE_CANCELLED' ? 'warning' : 'error', error?.message ?? 'The input could not be analysed.', { replace: true });
    return false;
  }
}

async function changeOutputRows() {
  const selected = document.querySelector('input[name="row-count"]:checked');
  elements.customRowCount.disabled = selected?.value !== 'custom';
  try {
    state.requestedRowCount = currentRequestedRowCount();
    const fidelity = businessFidelityModel(state.businessFidelity, state.businessFidelitySettings);
    const inputRowCount = state.analysis?.parseResult?.rowCount ?? null;
    if (fidelity.requiresInputRowCount && Number.isInteger(inputRowCount) && state.requestedRowCount !== inputRowCount) {
      elements.customRowPreset.checked = true;
      elements.customRowCount.disabled = false;
      elements.customRowCount.value = String(inputRowCount);
      state.requestedRowCount = inputRowCount;
      addMessage('warning', 'High match uses the source row count so row order and consecutive groups can stay exact.', { scope: 'FIDELITY_STATE' });
    }
    invalidateGeneratedResult();
    if (state.analysis) {
      state.outputPlan = state.usingWorker
        ? (await workerClient.replan({ requestedRowCount: state.requestedRowCount })).outputPlan
        : replanCoverage(state.analysis, state.requestedRowCount);
      renderCoverageSummary(elements.coverageSummary, state.outputPlan);
      renderBusinessFidelity();
      const notice = coverageNotice(state.outputPlan);
      addMessage(notice ? 'warning' : 'info', notice ?? `The selected ${state.requestedRowCount} output rows can cover every scenario currently available to the planner.`, { scope: 'COVERAGE_STATE' });
    }
  } catch (error) {
    addMessage('error', error.message);
  } finally {
    updateGenerateAvailability();
  }
}

async function useInputRowCount() {
  const model = sameAsInputModel(state.analysis?.parseResult?.rowCount ?? null);
  if (!model.available) return;
  elements.customRowPreset.checked = true;
  elements.customRowCount.disabled = false;
  elements.customRowCount.value = String(model.rowCount);
  await changeOutputRows();
}

async function buildScratchOutput(requestedRowCount) {
  if (state.scratchStructure === 'MULTI') {
    commitActiveDatasetTable();
    const datasetResult = generateIndependentDataset({ tables: state.datasetTables, defaultRowCount: requestedRowCount });
    const active = datasetResult.tableResults.find((table) => table.id === state.activeDatasetTableId) ?? datasetResult.tableResults[0];
    return Object.freeze({ ...active, datasetResult });
  }
  return workerClient
    ? workerClient.generateSchema({ generatedColumns: state.generatedColumns, requestedRowCount })
    : generateStandaloneDataset({ generatedColumns: state.generatedColumns, requestedRowCount });
}

async function generate() {
  if (state.workflowKind === 'TRANSFORM' && !state.analysis) return false;
  if (state.workflowKind === 'TRANSFORM' && requiresHeaderConfirmation(state.analysis.parseResult)) {
    addMessage('error', 'Generation is blocked because the header is ambiguous. Choose Yes or No under Header row, then analyse again.');
    elements.headerMode.focus();
    return false;
  }
  const unconfiguredShifts = state.workflowKind === 'TRANSFORM' ? currentUnconfiguredShifts() : [];
  if (unconfiguredShifts.length > 0) {
    addMessage('error', `Generation is paused: configure SHIFT offsets for ${unconfiguredShifts.map((entry) => entry.columnName).join(', ')}.`, { replace: true });
    elements.shiftReadiness.focus();
    return false;
  }
  const generationCost = currentGenerationCost();
  if (generationCost.requiresConfirmation
    && !globalThis.confirm(generationCostConfirmationMessage(generationCost))) {
    addMessage('info', 'Large generation cancelled before processing started. No output was changed.', { replace: true, scope: 'GENERATION_COST' });
    return false;
  }
  try {
    setWorkflow('GENERATING');
    elements.advancedRegenerate.disabled = true;
    addMessage('info', `Generating exactly ${state.requestedRowCount.toLocaleString()} rows…`, { replace: true });
    const generationRequest = {
      policies: state.policies,
      relationshipRules: state.relationships.filter(relationshipIsActive),
      requestedRowCount: state.requestedRowCount,
      mode: state.mode,
      businessFidelity: state.businessFidelity,
      businessFidelitySettings: state.businessFidelitySettings,
      generatedColumns: generatedColumnsForCurrentSurface(),
    };
    const built = state.workflowKind === 'SCRATCH'
      ? await buildScratchOutput(state.requestedRowCount)
      : state.usingWorker
        ? await workerClient.generate(generationRequest)
        : await generateFromAnalysis({
          input: state.input,
          analysis: state.analysis,
          ...generationRequest,
          onProgress: (update) => progress(update),
        });
    state.outputPlan = built.outputPlan;
    state.generationResult = built.generationResult;
    state.datasetResult = built.datasetResult ?? null;
    state.datasetPreviewProbe = false;
    setWorkflow('GENERATED');
    state.basicStep = 'RESULT';
    renderCoverageSummary(elements.coverageSummary, state.outputPlan);
    prepareComparisonControls();
    renderCurrentPreview();
    renderDatasetPreviewTabs();
    renderDatasetIntegrity(elements.datasetIntegrity, state.datasetResult
      ? { tables: state.datasetTables, datasetResult: state.datasetResult, probe: false }
      : null);
    renderGenerationValidation(elements.generationValidation, state.generationResult, { hidePassing: true });
    renderResultQualityReport({
      generationResult: state.generationResult,
      datasetResult: state.datasetResult,
      probe: false,
    });
    const valid = state.datasetResult?.validation.valid ?? state.generationResult.validation.valid;
    const outputDownloadable = isGeneratedResultDownloadable({ generationResult: state.generationResult });
    const datasetDownloadable = isDatasetResultDownloadable({ datasetResult: state.datasetResult });
    elements.exportCsv.disabled = !outputDownloadable;
    elements.exportTsv.disabled = !outputDownloadable;
    elements.exportDatasetZip.disabled = !datasetDownloadable;
    elements.advancedRegenerate.disabled = false;
    progress({ phase: 'COMPLETE', message: 'Generation complete.', current: 1, total: 1 }, false);
    if (valid) {
      addMessage('success', state.datasetResult
        ? `Generated and validated ${state.datasetResult.validation.totalRows.toLocaleString()} dummy rows across ${state.datasetResult.validation.tableCount} table${state.datasetResult.validation.tableCount === 1 ? '' : 's'}. Choose a table above the preview to inspect it.`
        : `Generated and validated ${state.generationResult.rows.length.toLocaleString()} dummy rows.`, { replace: true });
    } else {
      addMessage('warning', state.datasetResult
        ? `Generated ${state.datasetResult.validation.totalRows.toLocaleString()} dummy rows across ${state.datasetResult.validation.tableCount} table${state.datasetResult.validation.tableCount === 1 ? '' : 's'}; project integrity failed: ${summarizeDatasetIntegrityFailure(state.datasetResult.validation)}.`
        : `Generated ${state.generationResult.rows.length.toLocaleString()} rows; validation failed: ${summarizeValidationIssues(state.generationResult.issues, 4, state.generationResult.rows.length)}.`, { replace: true });
    }
    if (!state.datasetResult && currentGenerationVariation().kind === 'repeatable') {
      addMessage('info', currentGenerationVariation().text, { scope: 'GENERATION_VARIATION' });
    }
    for (const warning of summarizeGenerationWarnings(state.generationResult.warnings)) addMessage('warning', warning);
    renderBasicJourney();
    if (state.interfaceMode === 'BASIC' && !quickSurface) setBasicStep('RESULT');
    return true;
  } catch (error) {
    setWorkflow(error?.code === 'PIPELINE_CANCELLED' ? 'READY' : 'ERROR');
    elements.advancedRegenerate.disabled = !state.generationResult;
    progress({ phase: 'ERROR', message: 'Generation stopped.' }, false);
    addMessage(error?.code === 'PIPELINE_CANCELLED' ? 'warning' : 'error', error?.message ?? 'Dummy data could not be generated.', { replace: true });
    return false;
  }
}

async function probeGeneration() {
  if (state.workflowKind === 'TRANSFORM' && !state.analysis) return;
  if (state.workflowKind === 'TRANSFORM' && requiresHeaderConfirmation(state.analysis.parseResult)) {
    addMessage('error', 'The test run is blocked until the header choice is confirmed.');
    return;
  }
  const unconfiguredShifts = state.workflowKind === 'TRANSFORM' ? currentUnconfiguredShifts() : [];
  if (unconfiguredShifts.length > 0) {
    addMessage('error', `The test run is paused: configure SHIFT offsets for ${unconfiguredShifts.map((entry) => entry.columnName).join(', ')}.`, { replace: true });
    return;
  }
  const highMatchProbe = state.workflowKind === 'TRANSFORM'
    && businessFidelityModel(state.businessFidelity, state.businessFidelitySettings).requiresInputRowCount;
  const probeRows = Number(elements.probeRowCount.value);
  try {
    setWorkflow('GENERATING');
    addMessage('info', highMatchProbe
      ? `Testing ${probeRows} rows with Balanced sampling. Full generation will apply High match to every source row.`
      : `Testing the current rules with ${probeRows} rows…`, { replace: true, scope: 'PROBE_STATE' });
    const request = {
      policies: state.policies,
      relationshipRules: state.relationships.filter(relationshipIsActive),
      requestedRowCount: probeRows,
      mode: state.mode,
      businessFidelity: highMatchProbe ? 'BALANCED' : state.businessFidelity,
      businessFidelitySettings: highMatchProbe
        ? defaultBusinessFidelitySettings('BALANCED')
        : state.businessFidelitySettings,
      generatedColumns: generatedColumnsForCurrentSurface(),
    };
    const built = state.workflowKind === 'SCRATCH'
      ? await buildScratchOutput(probeRows)
      : state.usingWorker
        ? await workerClient.generate(request)
        : await generateFromAnalysis({ input: state.input, analysis: state.analysis, ...request, onProgress: (update) => progress(update) });
    setWorkflow('READY');
    state.datasetResult = built.datasetResult ?? null;
    state.datasetPreviewProbe = Boolean(state.datasetResult);
    if (state.datasetResult) state.generationResult = built.generationResult;
    elements.previewControls.hidden = true;
    elements.exportCsv.disabled = true;
    elements.exportTsv.disabled = true;
    elements.exportDatasetZip.disabled = true;
    renderPreviewTable(elements.previewTable, built.generationResult);
    elements.previewTable.classList.remove('empty-panel');
    renderGenerationValidation(elements.generationValidation, built.generationResult, { probe: true });
    renderResultQualityReport({
      generationResult: built.generationResult,
      datasetResult: built.datasetResult ?? null,
      probe: true,
    });
    renderDatasetPreviewTabs();
    renderDatasetIntegrity(elements.datasetIntegrity, state.datasetResult
      ? { tables: state.datasetTables, datasetResult: state.datasetResult, probe: true }
      : null);
    progress({ phase: 'READY', message: 'Probe complete.', current: 1, total: 1 }, false);
    const probeValid = built.datasetResult?.validation.valid ?? built.generationResult.validation.valid;
    addMessage(probeValid ? 'success' : 'error', probeValid
      ? built.datasetResult
        ? `Probe passed for all ${built.datasetResult.validation.tableCount} tables. Full export remains disabled until you generate the requested output.`
        : `Probe passed: ${probeRows} rows satisfy the current rules. Full export remains disabled until you generate the requested output.`
      : `Probe failed: ${summarizeValidationIssues(built.generationResult.issues)}.`, { replace: true, scope: 'PROBE_STATE' });
  } catch (error) {
    setWorkflow('READY');
    progress({ phase: 'ERROR', message: 'Probe stopped.' }, false);
    addMessage('error', error?.message ?? 'The rule probe could not be completed.', { replace: true, scope: 'PROBE_STATE' });
  }
}

function cancelActiveTask() {
  if (workerClient?.cancel('Cancelled by the user.')) {
    addMessage('warning', 'Cancellation requested. The current input chunk will finish before processing stops.');
  }
}

function exportResult(format) {
  if (!isGeneratedResultDownloadable({ generationResult: state.generationResult, probe: state.datasetPreviewProbe })) return;
  const excelSafe = elements.excelSafe.checked;
  const prepared = format === 'csv'
    ? exportCsv({ headers: state.generationResult.headers, rows: state.generationResult.rows, excelSafe })
    : exportTsv({ headers: state.generationResult.headers, rows: state.generationResult.rows, excelSafe });
  if (!excelSafe && prepared.formulaRisks.length > 0) {
    const allowed = confirmFormulaRiskExport(prepared.formulaRisks, 'This output');
    if (!allowed) return;
  }
  const downloaded = downloadBlob(prepared);
  addMessage('success', `Downloaded ${downloaded.filename}.`);
}


function quickTemplateFields(templateId) {
  return getDatasetTemplate(templateId).columns
    .map((column) => Object.freeze({
      name: column.name,
      generatorType: column.generatorType,
    }));
}

function quickCustomColumnTypes() {
  return Object.freeze(BASIC_GENERATOR_IDS.map((id) => {
    const generator = providerCatalog.getGenerator(id);
    return Object.freeze({ id: generator.id, label: generator.label });
  }));
}

function quickResultWarnings() {
  if (!state.generationResult) return [];
  const warnings = [...summarizeGenerationWarnings(state.generationResult.warnings)];
  if (state.generationResult.validation.valid === false) {
    warnings.push('Validation: ' + summarizeValidationIssues(
      state.generationResult.issues,
      4,
      state.generationResult.rows.length,
    ));
  }
  return warnings;
}

function applyQuickShiftDefaults() {
  const missingIndexes = new Set(currentUnconfiguredShifts().map((entry) => entry.columnIndex));
  state.policies = state.policies.map((policy, columnIndex) => {
    if (!missingIndexes.has(columnIndex) || policy.selectedAction !== 'SHIFT') return policy;
    const current = normaliseActionParams({
      action: 'SHIFT',
      detectedType: policy.detectedType,
      params: policy.actionParams,
    });
    if (current.offsetValue !== null) return policy;
    const preset = policy.detectedType === 'TIME'
      ? { offsetValue: '6', unit: 'HOURS' }
      : policy.detectedType === 'DATETIME'
        ? { offsetValue: '150', unit: 'HOURS' }
        : ['DATE', 'AMBIGUOUS_DATE'].includes(policy.detectedType)
          ? { offsetValue: '6', unit: 'DAYS' }
          : { offsetValue: '6', unit: 'INTEGER' };
    return Object.freeze({
      ...policy,
      actionParams: normaliseActionParams({
        action: 'SHIFT',
        detectedType: policy.detectedType,
        params: { ...current, offsetMode: 'FIXED', ...preset },
      }),
    });
  });
}

function quickBlockers() {
  const blockers = [];
  if (state.workflowKind === 'TRANSFORM' && state.analysis
    && requiresHeaderConfirmation(state.analysis.parseResult)) {
    blockers.push(Object.freeze({
      title: 'Confirm the header row',
      recovery: 'Open Advanced and choose Yes or No under Input options, then analyse the table again.',
    }));
  }
  if (state.workflowKind === 'TRANSFORM' && state.analysis) {
    for (const entry of currentUnconfiguredShifts()) {
      const ambiguousDate = entry.detectedType === 'AMBIGUOUS_DATE';
      blockers.push(Object.freeze(ambiguousDate ? {
        title: 'Confirm the date order for ' + entry.columnName,
        recovery: 'Open ' + entry.columnName + ' and choose DD/MM/YYYY or MM/DD/YYYY.',
      } : {
        title: 'Set an offset for ' + entry.columnName,
        recovery: 'Open ' + entry.columnName + ' and enter one explicit non-zero offset.',
      }));
    }
  }
  const enabledColumnCount = state.workflowKind === 'TRANSFORM'
    ? state.policies.filter((policy) => policy.selectedAction !== 'DROP').length
    : state.generatedColumns.filter((column) => column.enabled !== false).length;
  if ((state.analysis || state.workflowKind === 'SCRATCH') && enabledColumnCount === 0) {
    blockers.push(Object.freeze({
      title: 'Keep at least one column',
      recovery: 'Choose Generate or another transformation for at least one column.',
    }));
  }
  return Object.freeze(blockers);
}

function quickReviewPreview(task) {
  if (task === 'transform') {
    if (!state.analysis || state.policies.length === 0) return Object.freeze([]);
    const previews = buildActionPreviews({
      headers: state.analysis.headers,
      profiles: state.analysis.tableProfile.columns,
      detections: state.analysis.detections,
      policies: state.policies,
      relationshipRules: state.relationships.filter(relationshipIsActive),
      businessFidelity: state.businessFidelity,
      businessFidelitySettings: state.businessFidelitySettings,
      maxExamples: 1,
    });
    return Object.freeze(previews.map((preview, columnIndex) => {
      const example = preview.examples?.[0] ?? null;
      return Object.freeze({
        columnIndex,
        name: state.policies[columnIndex].columnName,
        source: example ? String(example.source || '(blank)') : '(no sample)',
        result: example
          ? String(example.proposed ?? '(blank)')
          : preview.status === 'EMPTY' ? '(no sample available)' : '(preview unavailable)',
        available: Boolean(example),
      });
    }));
  }
  const activeColumns = state.generatedColumns
    .map((column, columnIndex) => ({ column, columnIndex }))
    .filter(({ column }) => column.enabled !== false);
  if (state.generatedColumns.length === 0) return Object.freeze([]);
  try {
    const generated = generateStandaloneDataset({
      generatedColumns: activeColumns.map(({ column }) => column),
      requestedRowCount: 1,
      random: new SeededRandomSource(0x51_56_64),
    }).generationResult;
    const generatedPositionByColumn = new Map(activeColumns.map(({ columnIndex }, position) => [columnIndex, position]));
    return Object.freeze(state.generatedColumns.map((column, columnIndex) => {
      const generatedPosition = generatedPositionByColumn.get(columnIndex);
      const enabled = generatedPosition !== undefined;
      return Object.freeze({
        columnIndex,
        name: column.name,
        source: null,
        result: enabled ? String(generated.rows[0]?.[generatedPosition] ?? '(blank)') : '(field omitted)',
        available: enabled,
      });
    }));
  } catch {
    return Object.freeze([]);
  }
}

function quickSurfaceSnapshot() {
  const task = state.workflowKind === 'SCRATCH' ? 'scratch' : 'transform';
  const columns = task === 'transform'
    ? state.policies.map((policy) => Object.freeze({
        task,
        name: policy.columnName,
        detectedType: String(policy.detectedType ?? 'UNKNOWN').replaceAll('_', ' '),
        detectedTypeKey: String(policy.detectedType ?? 'UNKNOWN'),
        selectedAction: policy.selectedAction,
        recommendedAction: policy.recommendedAction,
        reviewRequired: Boolean(policy.reviewRequired),
        reason: policy.reason ?? '',
        actionParams: Object.freeze({ ...(policy.actionParams ?? {}) }),
        shiftKind: policy.actionParams?.shiftKind ?? null,
      }))
    : state.generatedColumns.map((column) => Object.freeze({
        task,
        name: column.name,
        detectedType: String(column.generatorType ?? 'generated field').replaceAll('-', ' '),
        detectedTypeKey: String(column.generatorType ?? 'GENERATED_FIELD').toUpperCase().replaceAll('-', '_'),
        selectedAction: column.enabled === false ? 'DROP' : 'GENERATE',
        recommendedAction: 'GENERATE',
        reviewRequired: false,
        reason: 'Generated from the ' + (column.blockLabel ?? 'selected') + ' production template.',
        actionParams: Object.freeze({}),
        shiftKind: null,
      }));
  const result = state.generationResult
    ? Object.freeze({
        headers: Object.freeze([...state.generationResult.headers]),
        rows: Object.freeze(state.generationResult.rows.map((row) => Object.freeze([...row]))),
        validationValid: state.generationResult.validation.valid,
        warnings: Object.freeze(quickResultWarnings()),
      })
    : null;
  return Object.freeze({
    task,
    columns: Object.freeze(columns),
    variation: generationVariationModel(columns),
    blockers: quickBlockers(),
    reviewPreview: quickReviewPreview(task),
    requestedRowCount: state.requestedRowCount,
    inputRowCount: state.analysis?.parseResult.rowCount ?? null,
    result,
  });
}

function currentGenerationVariation() {
  if (state.workflowKind === 'TRANSFORM') return generationVariationModel(state.policies);
  return generationVariationModel(state.generatedColumns.map((column) => ({
    selectedAction: column.enabled === false ? 'DROP' : 'GENERATE',
  })));
}

function applyQuickDefaults() {
  state.interfaceMode = 'BASIC';
  state.mode = 'SAFE_TEST_DATA';
  state.businessFidelity = 'BALANCED';
  state.businessFidelitySettings = defaultBusinessFidelitySettings('BALANCED');
  setRequestedRowControls(200);
  elements.modeSelect.value = state.mode;
  elements.excelSafe.checked = true;
  updateModeBoundary();
  renderBusinessFidelity();
  renderInterfaceMode();
}

function quickTaskChanged(task) {
  const kind = task === 'scratch' ? 'SCRATCH' : 'TRANSFORM';
  if (kind !== state.workflowKind) setWorkflowKind(kind);
  if (kind === 'SCRATCH' && state.scratchStructure !== 'SINGLE') setScratchStructure('SINGLE');
  applyQuickDefaults();
}

async function quickAnalyse({ file = null, pastedText = '', sourcePreference = null } = {}) {
  if (state.workflowKind !== 'TRANSFORM') setWorkflowKind('TRANSFORM');
  applyQuickDefaults();
  const succeeded = await analyse({
    file,
    pastedText,
    sourcePreference,
    pastedTextIsSample: isTransformSampleText(pastedText),
  });
  if (!succeeded || !state.analysis) return null;
  applyQuickShiftDefaults();
  renderPolicyArea();
  updateGenerateAvailability();
  return quickSurfaceSnapshot();
}

function quickPrepareScratch(templateId, {
  enabledTemplateFields = null,
  templates = null,
  customColumns = [],
} = {}) {
  if (state.workflowKind !== 'SCRATCH') setWorkflowKind('SCRATCH');
  if (state.scratchStructure !== 'SINGLE') setScratchStructure('SINGLE');
  applyQuickDefaults();
  const requestedTemplates = Array.isArray(templates) && templates.length > 0
    ? templates
    : [{ templateId, enabledFields: enabledTemplateFields }];
  state.templateId = getDatasetTemplate(requestedTemplates[0].templateId).id;
  state.templateBlockSequence = 0;
  state.generatedColumns = [];
  state.expandedGeneratedGroups.clear();
  state.sourceOutputSchema = createSourceOutputSchema();
  for (const requested of requestedTemplates) {
    const template = getDatasetTemplate(requested.templateId);
    state.templateBlockSequence += 1;
    const appended = appendDatasetTemplateBlock({
      existingColumns: state.generatedColumns,
      templateId: template.id,
      blockSequence: state.templateBlockSequence,
    });
    const enabledNames = Array.isArray(requested.enabledFields)
      ? new Set(requested.enabledFields.map((name) => String(name)))
      : new Set(template.columns.map((column) => column.name));
    state.generatedColumns = [
      ...state.generatedColumns,
      ...appended.map((column, index) => Object.freeze({
        ...column,
        enabled: enabledNames.has(template.columns[index].name),
      })),
    ];
  }
  const allowedGeneratorTypes = new Set(BASIC_GENERATOR_IDS);
  for (const customColumn of customColumns) {
    const name = String(customColumn?.name ?? '').trim();
    if (!name) continue;
    const generatorType = allowedGeneratorTypes.has(customColumn?.generatorType)
      ? customColumn.generatorType
      : 'category';
    const sequence = nextGeneratedSequence();
    state.generatedColumns = [
      ...state.generatedColumns,
      newGeneratedColumn(
        sequence,
        state.generatedColumns.length,
        generatorType,
        uniqueGeneratedName(name),
      ),
    ];
  }
  state.generatedColumns = reindexGeneratedColumns(state.generatedColumns);
  focusLatestGeneratedGroup();
  syncOutputSchema();
  invalidateGeneratedResult();
  renderTemplatePicker();
  renderGeneratedColumns();
  updateGenerateAvailability();
  return quickSurfaceSnapshot();
}

function quickChangeColumnAction(columnIndex, action) {
  invalidateGeneratedResult();
  if (state.workflowKind === 'TRANSFORM') {
    state.policies = [...updatePolicyAction({
      policies: state.policies,
      detections: state.analysis.detections,
      columnIndex,
      action,
    })];
    applyQuickShiftDefaults();
    renderPolicyArea();
  } else {
    if (!['GENERATE', 'DROP'].includes(action)) throw new RangeError('Quick single-table columns can be generated or dropped.');
    state.generatedColumns = reindexGeneratedColumns(state.generatedColumns.map((column, index) => index === columnIndex
      ? Object.freeze({ ...column, enabled: action === 'GENERATE' })
      : column));
    syncOutputSchema();
    renderGeneratedColumns();
    updateGenerateAvailability();
  }
  elements.reviewConfirm.checked = false;
  return quickSurfaceSnapshot();
}

function quickChangeColumnParams(columnIndex, params) {
  if (state.workflowKind !== 'TRANSFORM') return quickSurfaceSnapshot();
  invalidateGeneratedResult();
  state.policies = [...updatePolicyActionParams({
    policies: state.policies,
    columnIndex,
    params,
  })];
  applyQuickShiftDefaults();
  elements.reviewConfirm.checked = false;
  renderPolicyArea();
  return quickSurfaceSnapshot();
}

function quickChangeRowCount(rowCount) {
  const allowed = new Set([50, 100, 200, 500, 1000]);
  if (!allowed.has(rowCount)) throw new RangeError('Quick rows must be 50, 100, 200, 500, or 1,000.');
  invalidateGeneratedResult();
  setRequestedRowControls(rowCount);
  updateGenerateAvailability();
  return quickSurfaceSnapshot();
}

async function quickGenerate() {
  elements.reviewConfirm.checked = true;
  updateGenerateAvailability();
  const succeeded = await generate();
  return succeeded && state.generationResult ? quickSurfaceSnapshot() : null;
}

function quickDownload() {
  exportResult('csv');
}

function quickStartAnother() {
  state.workflow = 'IDLE';
  state.input = null;
  state.inputKind = null;
  state.analysis = null;
  state.policies = [];
  state.relationships = [];
  state.outputPlan = null;
  state.outputSchema = null;
  state.sourceOutputSchema = null;
  state.generatedColumns = [];
  state.generatedColumnSequence = 0;
  state.workflowKind = 'TRANSFORM';
  state.templateId = null;
  state.templateBlockSequence = 0;
  state.scratchStructure = 'SINGLE';
  state.datasetTables = [];
  state.activeDatasetTableId = null;
  state.datasetResult = null;
  state.generationResult = null;
  state.qualityReport = null;
  state.sourcePreview = null;
  state.previewMode = 'output';
  state.basicStep = 'INPUT';
  document.body.dataset.workflowKind = 'TRANSFORM';
  document.body.dataset.scratchStructure = 'SINGLE';
  for (const button of elements.workflowKindButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.workflowKind === 'TRANSFORM'));
  }
  applyQuickDefaults();
  renderDatasetWorkspace();
  renderGeneratedColumns();
  updateGenerateAvailability();
  addMessage('info', 'Choose a file, paste spreadsheet cells, or generate one fictional table.', {
    replace: true,
    scope: 'WORKFLOW_KIND',
  });
}

function quickOpenAdvanced(scratchDraft = null) {
  if (scratchDraft?.templateId && state.workflowKind === 'SCRATCH') {
    quickPrepareScratch(scratchDraft.templateId, scratchDraft);
  }
  state.interfaceMode = 'ADVANCED';
  renderInterfaceMode();
  scheduleSafeDraftSave();
  globalThis.scrollTo({ top: 0, behavior: 'smooth' });
}

function setAdvancedSourceStatus(title, detail = '', kind = 'info') {
  elements.advancedSourceStatus.dataset.kind = kind;
  elements.advancedSourceStatus.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = title;
  elements.advancedSourceStatus.append(strong);
  if (detail) elements.advancedSourceStatus.append(document.createTextNode(' · ' + detail));
  elements.advancedSourceStatus.hidden = false;
}

function advancedSourceKind() {
  const file = elements.fileInput.files?.[0] ?? null;
  const hasPaste = elements.pasteInput.value.trim() !== '';
  const sample = isTransformSampleText(elements.pasteInput.value);
  if (file && hasPaste && !sample && !['FILE', 'PASTE'].includes(state.inputSourcePreference)) return 'CONFLICT';
  if (file && (sample || state.inputSourcePreference === 'FILE')) return 'FILE';
  if (hasPaste && (sample || ['PASTE', 'SAMPLE'].includes(state.inputSourcePreference))) return sample ? 'SAMPLE' : 'PASTE';
  if (file) return 'FILE';
  if (hasPaste) return 'PASTE';
  return 'NONE';
}

function renderAdvancedSourceState() {
  const kind = advancedSourceKind();
  const file = elements.fileInput.files?.[0] ?? null;
  const sample = isTransformSampleText(elements.pasteInput.value);
  elements.advancedSourceConflict.hidden = kind !== 'CONFLICT';
  elements.advancedUseFileSource.textContent = file ? 'Use ' + file.name : 'Use uploaded file';
  elements.advancedPasteField.dataset.source = sample ? 'sample' : '';
  if (kind === 'CONFLICT') {
    elements.advancedSourceStatus.hidden = true;
  } else if (kind === 'FILE') {
    setAdvancedSourceStatus('Using ' + (file?.name ?? 'uploaded file'), sample ? 'Sample data is not used' : 'Ready to analyse locally');
  } else if (kind === 'SAMPLE') {
    setAdvancedSourceStatus('Sample loaded', `${TRANSFORM_SAMPLE.name} · ${TRANSFORM_SAMPLE.columnCount} columns · ${TRANSFORM_SAMPLE.rowCount} rows`);
  } else if (kind === 'PASTE') {
    setAdvancedSourceStatus('Using pasted data', 'Ready to analyse locally');
  } else {
    elements.advancedSourceStatus.hidden = true;
  }
  return kind;
}

function loadAdvancedTransformSample() {
  const file = elements.fileInput.files?.[0] ?? null;
  const hasUserPaste = elements.pasteInput.value.trim() !== '' && !isTransformSampleText(elements.pasteInput.value);
  if ((file || hasUserPaste)
    && !globalThis.confirm('Replace the current input choice with the fictional retail-orders sample?')) return;
  elements.fileInput.value = '';
  elements.fileName.textContent = 'No file selected';
  elements.pasteInput.value = TRANSFORM_SAMPLE.text;
  elements.pasteInput.scrollTop = 0;
  state.inputSourcePreference = 'SAMPLE';
  renderAdvancedSourceState();
  elements.pasteInput.focus();
  elements.pasteInput.setSelectionRange(0, 0);
}

elements.fileInput.addEventListener('change', () => {
  elements.fileName.textContent = elements.fileInput.files?.[0]?.name ?? 'No file selected';
  const hasUserPaste = elements.pasteInput.value.trim() !== '' && !isTransformSampleText(elements.pasteInput.value);
  state.inputSourcePreference = elements.fileInput.files?.[0]
    ? (hasUserPaste ? null : 'FILE')
    : (elements.pasteInput.value.trim() ? (isTransformSampleText(elements.pasteInput.value) ? 'SAMPLE' : 'PASTE') : null);
  renderAdvancedSourceState();
});
elements.pasteInput.addEventListener('input', () => {
  const file = elements.fileInput.files?.[0] ?? null;
  const hasPaste = elements.pasteInput.value.trim() !== '';
  const sample = isTransformSampleText(elements.pasteInput.value);
  if (!hasPaste) state.inputSourcePreference = file ? 'FILE' : null;
  else if (sample) state.inputSourcePreference = file ? 'FILE' : 'SAMPLE';
  else if (!file || state.inputSourcePreference === 'PASTE') state.inputSourcePreference = 'PASTE';
  else state.inputSourcePreference = null;
  renderAdvancedSourceState();
});
elements.delimiterMode.addEventListener('change', () => {
  elements.customDelimiterWrap.hidden = elements.delimiterMode.value !== 'custom';
  if (elements.delimiterMode.value !== 'custom') elements.customDelimiter.value = '';
});
elements.advancedSampleData.addEventListener('click', loadAdvancedTransformSample);
elements.advancedUseFileSource.addEventListener('click', () => {
  state.inputSourcePreference = 'FILE';
  renderAdvancedSourceState();
});
elements.advancedUsePasteSource.addEventListener('click', () => {
  state.inputSourcePreference = 'PASTE';
  renderAdvancedSourceState();
});
elements.analyseButton.addEventListener('click', async () => {
  const kind = renderAdvancedSourceState();
  if (kind === 'NONE') {
    setAdvancedSourceStatus('Add a source table', 'Upload a file, paste spreadsheet cells, or try the sample data', 'error');
    elements.advancedSampleData.focus();
    return;
  }
  if (kind === 'CONFLICT') {
    elements.advancedSourceConflict.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    elements.advancedUseFileSource.focus();
    return;
  }
  await analyse({
    sourcePreference: state.inputSourcePreference,
    pastedTextIsSample: isTransformSampleText(elements.pasteInput.value),
  });
});
for (const button of elements.workflowKindButtons) {
  button.addEventListener('click', () => setWorkflowKind(button.dataset.workflowKind));
}
for (const button of elements.scratchStructureButtons) {
  button.addEventListener('click', () => {
    const structure = button.dataset.scratchStructure;
    const opensAdvancedEditor = structure === 'MULTI' && state.interfaceMode === 'BASIC';
    if (opensAdvancedEditor) {
      state.interfaceMode = 'ADVANCED';
      renderInterfaceMode();
      addMessage('info', 'Related tables uses the Advanced project editor. Advanced is now active—add tables, keys, and links below.', { scope: 'INTERFACE_MODE' });
    }
    setScratchStructure(structure);
    if (opensAdvancedEditor) elements.addDatasetTable.focus();
  });
}
elements.addDatasetTable.addEventListener('click', () => {
  const table = addDatasetTable();
  addMessage('success', `Added ${table.name}. Add a template block or individual fields to it.`, { scope: 'DATASET_TABLE' });
});
elements.datasetTableName.addEventListener('change', () => renameActiveDatasetTable(elements.datasetTableName.value));
elements.deleteDatasetTable.addEventListener('click', deleteActiveDatasetTable);
elements.loadConnectedScenario.addEventListener('click', loadConnectedScenario);
elements.datasetPrimaryKey.addEventListener('change', () => setActivePrimaryKey(elements.datasetPrimaryKey.value));
elements.datasetForeignTarget.addEventListener('change', () => {
  elements.addForeignKey.disabled = !elements.datasetForeignTarget.value;
});
elements.addForeignKey.addEventListener('click', addForeignKeyColumn);
elements.crossRuleForeignKey.addEventListener('change', refreshCrossRuleParentColumns);
elements.crossRuleKind.addEventListener('change', refreshCrossRuleParentColumns);
elements.crossRuleParentColumn.addEventListener('change', () => {
  elements.addCrossRule.disabled = !elements.crossRuleForeignKey.value || !elements.crossRuleParentColumn.value;
});
elements.addCrossRule.addEventListener('click', addCrossTableRuleColumn);
elements.generatedColumnsToggle.addEventListener('click', () => {
  setGeneratedColumnsExpanded(!state.generatedColumnsExpanded);
});
elements.reviewGeneratedColumns.addEventListener('click', reviewGeneratedColumns);
elements.addGeneratedColumn.addEventListener('click', () => {
  setGeneratedColumnsExpanded(true);
  addGeneratedColumnOfType();
});
elements.generatorSearch.addEventListener('input', renderGeneratorCatalog);
elements.personalSetPicker.addEventListener('change', () => renderPersonalFieldSets());
elements.savePersonalSet.addEventListener('click', savePersonalFieldSet);
elements.loadPersonalSet.addEventListener('click', loadPersonalFieldSet);
elements.deletePersonalSet.addEventListener('click', deletePersonalFieldSet);
elements.probeButton.addEventListener('click', probeGeneration);
elements.downloadConfig.addEventListener('click', exportConfiguration);
elements.configFile.addEventListener('change', () => {
  if (elements.configFile.files?.[0]) setGeneratedColumnsExpanded(true);
  importConfiguration(elements.configFile.files?.[0] ?? null);
});
elements.keepAllButton.addEventListener('click', () => {
  if (!state.analysis) return;
  invalidateGeneratedResult();
  state.policies = [...keepAllPolicies({ policies: state.policies, detections: state.analysis.detections })];
  elements.reviewConfirm.checked = false;
  renderPolicyArea();
  addMessage('warning', 'All columns now use KEEP. Source values may remain in the small output; review every high-risk column before generating.', { scope: 'POLICY_STATE' });
});
elements.applyRecommendationsButton.addEventListener('click', () => {
  if (!state.analysis) return;
  invalidateGeneratedResult();
  state.policies = [...applyRecommendedPolicies({ policies: state.policies, detections: state.analysis.detections })];
  elements.reviewConfirm.checked = false;
  renderPolicyArea();
  addMessage('info', 'System recommendations restored. Recommended SHIFT columns still require your explicit offsets.', { scope: 'POLICY_STATE' });
});
document.querySelectorAll('input[name="row-count"]').forEach((input) => input.addEventListener('change', changeOutputRows));
elements.customRowCount.addEventListener('change', changeOutputRows);
elements.sameAsInputRows.addEventListener('click', useInputRowCount);
elements.modeSelect.addEventListener('change', () => {
  invalidateGeneratedResult();
  state.mode = elements.modeSelect.value;
  elements.reviewConfirm.checked = false;
  updateModeBoundary();
  updateGenerateAvailability();
  if (state.mode === 'ID_ONLY') addMessage('warning', 'ID Only is pseudonymisation and leaves indirect identifiers unchanged.');
});
for (const input of elements.businessFidelityInputs) {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    invalidateGeneratedResult();
    state.businessFidelity = input.value;
    state.businessFidelitySettings = defaultBusinessFidelitySettings(input.value);
    elements.reviewConfirm.checked = false;
    renderBusinessFidelity();
    if (state.analysis && businessFidelityModel(input.value).requiresInputRowCount) await useInputRowCount();
    if (state.analysis) {
      renderBusinessFidelity();
      renderPolicyArea();
    }
    addMessage(
      input.value === 'HIGH' ? 'warning' : 'info',
      businessFidelityModel(input.value).boundary,
      { scope: 'FIDELITY_STATE' },
    );
  });
}
for (const input of elements.businessFidelitySettings) {
  input.addEventListener('change', () => {
    invalidateGeneratedResult();
    state.businessFidelitySettings = normaliseBusinessFidelitySettings(state.businessFidelity, {
      ...state.businessFidelitySettings,
      [input.dataset.fidelitySetting]: input.checked,
    });
    elements.reviewConfirm.checked = false;
    renderBusinessFidelity();
    updateGenerateAvailability();
  });
}
for (const button of elements.interfaceModeButtons) {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.interfaceMode;
    if (nextMode === 'BASIC' && state.workflowKind === 'SCRATCH' && state.scratchStructure === 'MULTI') {
      setScratchStructure('SINGLE');
    }
    state.interfaceMode = nextMode;
    renderInterfaceMode();
    scheduleSafeDraftSave();
    addMessage('info', interfaceModeModel(state.interfaceMode).description, { scope: 'INTERFACE_MODE' });
  });
}
for (const button of elements.basicStepButtons) {
  button.addEventListener('click', () => setBasicStep(button.dataset.basicStepTarget, { moveFocus: true }));
}
elements.generateButton.addEventListener('click', generate);
elements.advancedRegenerate.addEventListener('click', generate);
elements.reviewConfirm.addEventListener('change', updateGenerateAvailability);
elements.compareToggle.addEventListener('click', toggleSourceComparison);
elements.cancelButton.addEventListener('click', cancelActiveTask);
elements.exportCsv.addEventListener('click', () => exportResult('csv'));
elements.exportTsv.addEventListener('click', () => exportResult('tsv'));
elements.exportDatasetZip.addEventListener('click', exportDatasetZip);
elements.undoConfig.addEventListener('click', () => {
  const entry = undoStack.pop();
  updateRecoveryControls();
  if (entry) restoreRecoverySnapshot(entry);
});
elements.clearWork.addEventListener('click', () => {
  const confirmed = globalThis.confirm('Start over and clear the current in-tab draft? Download a config first if you may need these rules again.');
  if (!confirmed) return;
  globalThis.sessionStorage?.removeItem(RECOVERY_DRAFT_KEY);
  globalThis.location.reload();
});
document.addEventListener('click', prepareRecoveryForMutation, true);
document.addEventListener('change', prepareRecoveryForMutation, true);

restoreSafeDraft();
elements.inputOptions.open = false;
renderAdvancedSourceState();
enhanceStaticInfoTooltips();
showMessages();
renderTemplatePicker();
renderDatasetWorkspace();
renderGeneratedColumns();
renderGeneratorCatalog();
restorePersonalFieldSets();
elements.appVersion.textContent = APP_RELEASE.version;
elements.appVersion.title = `${APP_RELEASE.version} · ${APP_RELEASE.name}`;
updateModeBoundary();
renderBusinessFidelity();
renderInterfaceMode();
renderBasicJourney();

quickSurface = mountQuickPrototypeSurface(elements.quickSurfaceHost, {
  templateFields: quickTemplateFields,
  customColumnTypes: quickCustomColumnTypes,
  taskChanged: quickTaskChanged,
  analyse: quickAnalyse,
  prepareScratch: quickPrepareScratch,
  changeColumnAction: quickChangeColumnAction,
  changeColumnParams: quickChangeColumnParams,
  changeRowCount: quickChangeRowCount,
  generate: quickGenerate,
  download: quickDownload,
  startAnother: quickStartAnother,
  openAdvanced: quickOpenAdvanced,
});
if (state.analysis || state.generatedColumns.length > 0 || state.generationResult) {
  quickSurface.refresh(quickSurfaceSnapshot());
}

// Kept as a small public surface for automated browser verification only; it
// exposes status and counts, never source rows, profiles, mappings, or samples.
globalThis.dummyDataLabStatus = () => Object.freeze({
  version: APP_RELEASE.version,
  workflow: state.workflow,
  workerAvailable: Boolean(workerClient),
  processingSurface: state.analysis ? (state.usingWorker ? 'WORKER' : 'SAFE_FALLBACK') : null,
  inputRowCount: state.analysis?.parseResult.rowCount ?? null,
  requestedRowCount: state.requestedRowCount,
  generatedRowCount: state.generationResult?.rows.length ?? null,
  validationValid: state.generationResult?.validation.valid ?? null,
  interfaceMode: state.interfaceMode,
  basicStep: state.basicStep,
  workflowKind: state.workflowKind,
  businessFidelity: state.businessFidelity,
  outputColumnCount: state.outputSchema?.columns.length ?? null,
  quickSurfaceMounted: Boolean(quickSurface),
  quickStep: quickSurface?.step ?? null,
});
