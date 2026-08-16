import { CandidateReservoir, createPolicySafeTemplateRow } from '../coverage/candidate-reservoir.js';
import { planCoverage } from '../coverage/coverage-planner.js';
import { generateOutput } from '../generation/generate-output.js';
import { parseDelimited } from '../input/parse-delimited.js';
import { normaliseActionParams } from '../policy/action-parameters.js';
import { appendGeneratedColumns } from '../generation/generated-column-engine.js';
import {
  balancedIndexPreference,
  chooseBalancedEntries,
  createBalancedStrataPlan,
  createBalancedStrataTracker,
} from '../business/structured-source-selection.js';
import { parseBusinessNumber } from '../business/relationship-profiler.js';
import { relationshipIsActive } from '../core/contracts.js';
import {
  DEFAULT_BUSINESS_FIDELITY,
  normaliseBusinessFidelity,
  normaliseBusinessFidelitySettings,
} from '../business/fidelity.js';

function reportProgress(callback, phase, message, current = null, total = null) {
  callback?.(Object.freeze({ phase, message, current, total }));
}

const BUSINESS_RELATIONSHIP_KINDS = new Set([
  'NUMERIC_EQUAL', 'NUMERIC_DIFFERENCE', 'NUMERIC_RATIO',
  'BOOLEAN_FROM_POSITIVE', 'POSITIVE_FROM_BOOLEAN',
]);

export async function generateFromAnalysis({
  input,
  analysis,
  policies,
  relationshipRules = [],
  requestedRowCount,
  mode,
  businessFidelity = DEFAULT_BUSINESS_FIDELITY,
  businessFidelitySettings = null,
  onProgress,
  random,
  generatedColumns = [],
  chunkController = null,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
}) {
  if (!analysis) throw new TypeError('analysis is required.');
  const totalStartedAt = now();
  const fidelity = normaliseBusinessFidelity(businessFidelity);
  const fidelitySettings = normaliseBusinessFidelitySettings(fidelity, businessFidelitySettings ?? {});
  const safeTemplateSignature = (policy) => {
    if (policy?.selectedAction === 'GENERALISE') {
      const params = normaliseActionParams({ action: 'GENERALISE', detectedType: policy.detectedType, params: policy.actionParams });
      return JSON.stringify({ action: policy.selectedAction, strategy: params.strategy, level: params.level });
    }
    if (policy?.selectedAction !== 'PATTERN_REPLACE') return policy?.selectedAction ?? null;
    const params = normaliseActionParams({ action: 'PATTERN_REPLACE', detectedType: policy.detectedType, params: policy.actionParams });
    return JSON.stringify({
      action: policy.selectedAction,
      patternMode: params.patternMode,
      autoPrefixGroups: params.autoPrefixGroups,
      autoSuffixGroups: params.autoSuffixGroups,
      multiValueMode: params.multiValueMode,
      multiValueDetected: params.multiValueDetected,
      multiValueConfidence: params.multiValueConfidence,
      multiValueItemShape: params.multiValueItemShape,
      multiValueSeparatorKinds: params.multiValueSeparatorKinds,
      customDefaultAction: params.customDefaultAction,
      prefixAction: params.prefixAction,
      prefixLength: params.prefixLength,
      prefixReplacement: params.prefixReplacement,
      suffixAction: params.suffixAction,
      suffixLength: params.suffixLength,
      suffixReplacement: params.suffixReplacement,
      segmentRules: params.segmentRules,
    });
  };
  const policiesUnchanged = Array.isArray(analysis.policies)
    && analysis.policies.length === policies.length
    && policies.every((policy, index) => safeTemplateSignature(policy) === safeTemplateSignature(analysis.policies[index]));
  const canReuseCandidates = policiesUnchanged && Array.isArray(analysis.candidates);
  let candidates;
  let candidateSummary;
  let templateScanMs = 0;

  if (canReuseCandidates) {
    reportProgress(
      onProgress,
      'TEMPLATES',
      'Reusing bounded templates already sanitised by the confirmed policies.',
      analysis.candidates.length,
      analysis.candidates.length,
    );
    candidates = analysis.candidates;
    candidateSummary = analysis.candidateSummary;
  } else {
    reportProgress(onProgress, 'TEMPLATES', 'Refreshing bounded templates with your confirmed policies...');
    const templateStartedAt = now();
    const reservoir = new CandidateReservoir({ capacity: 512, policies });
    await parseDelimited(input, {
      ...analysis.parseOptions,
      collectRows: false,
      onRow(row, context) {
        reservoir.offer(row, {
          sourceRowIndex: context.sourceRowIndex,
          matchers: analysis.extraction.matchers,
        });
        if (chunkController && !chunkController.checkpoint({
          phase: 'TEMPLATES',
          rowCount: context.rowIndex,
          total: analysis.parseResult.rowCount,
          message: `Refreshing safe templates: ${context.rowIndex.toLocaleString()} scanned...`,
        })) return false;
        return true;
      },
    });
    chunkController?.throwIfCancelled();
    templateScanMs = now() - templateStartedAt;
    candidates = reservoir.snapshot();
    candidateSummary = reservoir.publicSummary();
  }

  const outputPlan = planCoverage({
    scenarios: analysis.extraction.scenarios,
    candidates,
    matchedScenarioIds: candidateSummary?.matchedScenarioIds,
    scenarioRepresentativeLimitReached: candidateSummary?.scenarioRepresentativeLimitReached,
    requestedRowCount,
    inputRowCount: analysis.parseResult.rowCount,
  });
  let sourceEntries = null;
  let structureScanMs = 0;
  const confirmedBusinessRelationshipRules = relationshipRules.filter((rule) => relationshipIsActive(rule)
    && BUSINESS_RELATIONSHIP_KINDS.has(rule.kind));
  const confirmedNumericColumnIndexes = [...new Set(confirmedBusinessRelationshipRules.flatMap((rule) => [
    rule.options?.sourceColumnIndex,
    rule.options?.targetColumnIndex,
  ]).filter(Number.isInteger))];
  let sourceNumericRankData = fidelity === 'HIGH'
    && fidelitySettings.preserveNumericRelationships
    && confirmedNumericColumnIndexes.length > 1
    ? { columnIndexes: confirmedNumericColumnIndexes, rows: [] }
    : null;
  if (fidelity === 'HIGH' && requestedRowCount !== analysis.parseResult.rowCount) {
    throw new RangeError(`High match requires the source row count (${analysis.parseResult.rowCount.toLocaleString()}) so row order and consecutive groups remain exact.`);
  }
  if (fidelity === 'HIGH' && analysis.parseResult.rowCount > 0) {
    reportProgress(onProgress, 'STRUCTURE', 'Protecting the complete source sequence for exact business-structure matching...');
    const structureStartedAt = now();
    const capturedEntries = [];
    await parseDelimited(input, {
      ...analysis.parseOptions,
      collectRows: false,
      onRow(row, context) {
        if (sourceNumericRankData) {
          sourceNumericRankData.rows.push(Object.freeze(sourceNumericRankData.columnIndexes.map((columnIndex) => parseBusinessNumber(row[columnIndex]))));
        }
        capturedEntries.push(Object.freeze({
          dataRowIndex: context.rowIndex,
          sourceRowIndex: context.sourceRowIndex,
          row: createPolicySafeTemplateRow(row, policies),
        }));
        if (chunkController && !chunkController.checkpoint({
          phase: 'STRUCTURE',
          rowCount: context.rowIndex,
          total: analysis.parseResult.rowCount,
          message: `Protecting exact source sequence: ${context.rowIndex.toLocaleString()} scanned...`,
        })) return false;
        return true;
      },
    });
    chunkController?.throwIfCancelled();
    sourceEntries = Object.freeze(capturedEntries);
    if (sourceNumericRankData) sourceNumericRankData = Object.freeze({
      columnIndexes: Object.freeze([...sourceNumericRankData.columnIndexes]),
      rows: Object.freeze([...sourceNumericRankData.rows]),
    });
    structureScanMs = now() - structureStartedAt;
  }
  const needsStructuredSource = fidelity === 'BALANCED' && (
    fidelitySettings.preserveRowOrder
    || fidelitySettings.preserveGroupRuns
    || (fidelitySettings.preserveRelationships && relationshipRules.some(relationshipIsActive))
    || (fidelitySettings.preserveNumericRelationships && confirmedBusinessRelationshipRules.length > 0)
    || fidelitySettings.preserveNullPositions
  );
  if (needsStructuredSource && analysis.parseResult.rowCount > 0) {
    reportProgress(onProgress, 'STRUCTURE', 'Selecting representative source blocks and keeping row combinations together...');
    const structureStartedAt = now();
    const preferenceTarget = Math.min(
      analysis.parseResult.rowCount,
      Math.max(requestedRowCount, requestedRowCount * 2),
    );
    const preferredDataRowIndexes = balancedIndexPreference(
      analysis.parseResult.rowCount,
      Math.max(1, preferenceTarget),
      { preserveContiguousBlocks: fidelitySettings.preserveGroupRuns },
    );
    const preferredSet = new Set(preferredDataRowIndexes);
    const uncoveredScenarioIds = new Set(outputPlan.coveredScenarioIds ?? []);
    const mandatorySourceRowIndexes = [];
    for (const reference of outputPlan.selectedTemplateRows ?? []) {
      const coveredHere = (reference.coverageScenarioIds ?? []).filter((scenarioId) => uncoveredScenarioIds.has(scenarioId));
      if (coveredHere.length === 0) continue;
      if (Number.isInteger(reference.sourceRowIndex)) mandatorySourceRowIndexes.push(reference.sourceRowIndex);
      for (const scenarioId of coveredHere) uncoveredScenarioIds.delete(scenarioId);
      if (uncoveredScenarioIds.size === 0) break;
    }
    Object.freeze(mandatorySourceRowIndexes);
    const mandatorySet = new Set(mandatorySourceRowIndexes);
    const balancedStrata = createBalancedStrataPlan({
      profiles: analysis.tableProfile.columns,
      detections: analysis.detections,
      policies,
      requestedRowCount: Math.min(requestedRowCount, analysis.parseResult.rowCount),
      preserveNullPositions: fidelitySettings.preserveNullPositions,
    });
    const balancedStrataTracker = createBalancedStrataTracker(balancedStrata);
    const capturedEntries = [];
    await parseDelimited(input, {
      ...analysis.parseOptions,
      collectRows: false,
      onRow(row, context) {
        const stratumMatch = balancedStrataTracker.inspect(row);
        if (preferredSet.has(context.rowIndex) || mandatorySet.has(context.sourceRowIndex) || stratumMatch.capture) {
          capturedEntries.push({
            dataRowIndex: context.rowIndex,
            sourceRowIndex: context.sourceRowIndex,
            balancedStrataIds: stratumMatch.featureIds,
            row: createPolicySafeTemplateRow(row, policies),
          });
        }
        if (chunkController && !chunkController.checkpoint({
          phase: 'STRUCTURE',
          rowCount: context.rowIndex,
          total: analysis.parseResult.rowCount,
          message: `Selecting business-structure rows: ${context.rowIndex.toLocaleString()} scanned...`,
        })) return false;
        return true;
      },
    });
    chunkController?.throwIfCancelled();
    sourceEntries = chooseBalancedEntries({
      capturedEntries,
      preferredDataRowIndexes,
      mandatorySourceRowIndexes,
      requestedRowCount: Math.min(requestedRowCount, analysis.parseResult.rowCount),
      balancedStrata,
    });
    structureScanMs = now() - structureStartedAt;
  }
  reportProgress(
    onProgress,
    'GENERATING',
    `Generating ${requestedRowCount.toLocaleString()} dummy rows...`,
    0,
    requestedRowCount,
  );
  const generationStartedAt = now();
  const sourceGenerationResult = generateOutput({
    outputPlan,
    headers: analysis.headers,
    policies,
    profiles: analysis.tableProfile.columns,
    detections: analysis.detections,
    candidateTemplates: candidates,
    sourceEntries,
    businessRelationshipRules: confirmedBusinessRelationshipRules,
    sourceNumericRankData,
    relationshipRules,
    mode,
    businessFidelity: fidelity,
    businessFidelitySettings: fidelitySettings,
    ...(random ? { random } : {}),
  });
  const generationResult = appendGeneratedColumns({
    generationResult: sourceGenerationResult,
    generatedColumns,
    ...(random ? { random } : {}),
  });
  const generationMs = now() - generationStartedAt;
  const metrics = Object.freeze({
    templateScanMs,
    structureScanMs,
    confirmedBusinessRelationshipCount: confirmedBusinessRelationshipRules.length,
    generationMs,
    totalMs: now() - totalStartedAt,
    candidateSource: canReuseCandidates ? 'ANALYSIS_REUSE' : 'POLICY_RESCAN',
  });
  reportProgress(
    onProgress,
    'COMPLETE',
    'Dummy data generation complete.',
    generationResult.rows.length,
    requestedRowCount,
  );
  return Object.freeze({ generationResult, outputPlan, candidates, candidateSummary, metrics, businessFidelity: fidelity });
}
