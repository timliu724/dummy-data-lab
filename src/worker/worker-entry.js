import { analyseInput, replanCoverage } from '../pipeline/analyse-input.js';
import { createChunkController, PipelineCancelledError } from '../pipeline/chunk-controller.js';
import { generateFromAnalysis } from '../pipeline/generate-from-analysis.js';
import { collectSourceComparison } from '../pipeline/source-comparison.js';
import { generateStandaloneDataset } from '../generation/generated-column-engine.js';
import {
  WORKER_COMMANDS,
  WORKER_EVENTS,
  createWorkerEvent,
  serialiseWorkerError,
} from './worker-protocol.js';

function publicColumnProfile(profile) {
  if (!profile.numericStats) return profile;
  const {
    distributionSample: _privateDistributionSample,
    distributionSupport: _privateDistributionSupport,
    ...numericStats
  } = profile.numericStats;
  return Object.freeze({ ...profile, numericStats: Object.freeze(numericStats) });
}

function publicTableProfile(tableProfile) {
  return Object.freeze({
    ...tableProfile,
    columns: Object.freeze(tableProfile.columns.map(publicColumnProfile)),
  });
}

function publicAnalysis(analysis) {
  return Object.freeze({
    headers: analysis.headers,
    parseResult: analysis.parseResult,
    tableProfile: publicTableProfile(analysis.tableProfile),
    detections: analysis.detections,
    tableRisk: analysis.tableRisk,
    policies: analysis.policies,
    relationshipProposals: analysis.relationshipProposals,
    autoRelationshipRules: analysis.autoRelationshipRules,
    jointSamplingGroups: analysis.jointSamplingGroups,
    extraction: Object.freeze({
      scenarios: analysis.extraction.scenarios,
      warnings: analysis.extraction.warnings ?? Object.freeze([]),
    }),
    candidateSummary: analysis.candidateSummary,
    outputPlan: analysis.outputPlan,
    parseOptions: analysis.parseOptions,
    recognitionSummary: analysis.recognitionSummary,
    metrics: analysis.metrics,
  });
}

export function createWorkerRuntime({ postMessage: emit } = {}) {
  if (typeof emit !== 'function') throw new TypeError('postMessage must be a function.');
  let session = null;
  let active = null;

  const post = (type, requestId, payload) => emit(createWorkerEvent(type, requestId, payload));
  const progress = (requestId) => (payload) => post(WORKER_EVENTS.PROGRESS, requestId, payload);

  const runTask = async (request) => {
    const { type, requestId, payload = {} } = request;
    if (type === WORKER_COMMANDS.CANCEL) {
      if (active && (!payload.targetRequestId || payload.targetRequestId === active.requestId)) {
        active.controller.cancel(payload.reason);
      }
      return;
    }
    if (type === WORKER_COMMANDS.PING) {
      post(WORKER_EVENTS.PONG, requestId, { ready: true, hasSession: Boolean(session) });
      return;
    }
    if (active) {
      post(WORKER_EVENTS.ERROR, requestId, serialiseWorkerError(new Error('The Worker is already processing another request.')));
      return;
    }

    const controller = createChunkController({ onProgress: progress(requestId) });
    active = { requestId, controller };
    try {
      if (type === WORKER_COMMANDS.ANALYSE) {
        const analysis = await analyseInput({
          input: payload.input,
          parseOptions: payload.parseOptions,
          recognitionOptions: payload.recognitionOptions,
          requestedRowCount: payload.requestedRowCount,
          onProgress: progress(requestId),
          chunkController: controller,
        });
        session = { input: payload.input, analysis };
        post(WORKER_EVENTS.RESULT, requestId, { analysis: publicAnalysis(analysis) });
      } else if (type === WORKER_COMMANDS.REPLAN) {
        if (!session) throw new Error('Analyse an input before replanning coverage.');
        const outputPlan = replanCoverage(session.analysis, payload.requestedRowCount);
        post(WORKER_EVENTS.RESULT, requestId, { outputPlan });
      } else if (type === WORKER_COMMANDS.GENERATE) {
        if (!session) throw new Error('Analyse an input before generation.');
        const built = await generateFromAnalysis({
          input: session.input,
          analysis: session.analysis,
          policies: payload.policies,
          relationshipRules: payload.relationshipRules,
          requestedRowCount: payload.requestedRowCount,
          mode: payload.mode,
          businessFidelity: payload.businessFidelity,
          businessFidelitySettings: payload.businessFidelitySettings,
          generatedColumns: payload.generatedColumns,
          onProgress: progress(requestId),
          chunkController: controller,
        });
        session = { ...session, generationResult: built.generationResult };
        post(WORKER_EVENTS.RESULT, requestId, {
          outputPlan: built.outputPlan,
          generationResult: built.generationResult,
          candidateSummary: built.candidateSummary,
          metrics: built.metrics,
        });
      } else if (type === WORKER_COMMANDS.GENERATE_SCHEMA) {
        progress(requestId)({ phase: 'GENERATING', message: `Generating ${payload.requestedRowCount.toLocaleString()} rows from the selected schema…`, current: 0, total: payload.requestedRowCount });
        const built = generateStandaloneDataset({
          generatedColumns: payload.generatedColumns,
          requestedRowCount: payload.requestedRowCount,
        });
        progress(requestId)({ phase: 'COMPLETE', message: 'Standalone dummy data generation complete.', current: payload.requestedRowCount, total: payload.requestedRowCount });
        post(WORKER_EVENTS.RESULT, requestId, built);
      } else if (type === WORKER_COMMANDS.COMPARE) {
        if (!session?.generationResult) throw new Error('Generate output before requesting a source comparison.');
        const allowedIndexes = new Set(session.generationResult.sourcePreviewReferences
          .map((entry) => entry.sourceRowIndex)
          .filter((value) => Number.isInteger(value) && value >= 0));
        const requestedIndexes = (payload.sourceRowIndexes ?? []).filter((value) => allowedIndexes.has(value));
        const sourcePreview = await collectSourceComparison({
          input: session.input,
          parseOptions: session.analysis.parseOptions,
          sourceRowIndexes: requestedIndexes,
          expectedHeaders: session.analysis.headers,
        });
        post(WORKER_EVENTS.RESULT, requestId, { sourcePreview });
      } else {
        throw new RangeError(`Unsupported Worker command: ${type}`);
      }
    } catch (error) {
      if (error instanceof PipelineCancelledError || error?.code === 'PIPELINE_CANCELLED') {
        post(WORKER_EVENTS.CANCELLED, requestId, serialiseWorkerError(error));
      } else {
        post(WORKER_EVENTS.ERROR, requestId, serialiseWorkerError(error));
      }
    } finally {
      active = null;
    }
  };

  return Object.freeze({ handleMessage: runTask, get activeRequestId() { return active?.requestId ?? null; } });
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  const runtime = createWorkerRuntime({ postMessage: (message) => globalThis.postMessage(message) });
  globalThis.addEventListener('message', (event) => runtime.handleMessage(event.data));
  globalThis.postMessage(createWorkerEvent(WORKER_EVENTS.READY, null, { ready: true }));
}
