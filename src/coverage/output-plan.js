import { createOutputPlan } from '../core/contracts.js';

/**
 * Builds the public OutputPlan and strips all internal template values.
 *
 * @param {Object} values
 */
export function createCoverageOutputPlan(values) {
  const selectedTemplateRows = values.selectedCandidates.map((candidate) => Object.freeze({
    sourceRowIndex: candidate.sourceRowIndex,
    coverageScenarioIds: Object.freeze([...candidate.scenarioIds]),
    score: candidate.score,
    plannedUseCount: candidate.plannedUseCount,
  }));
  return createOutputPlan({
    inputRowCount: values.inputRowCount ?? null,
    requestedRowCount: values.requestedRowCount,
    recommendedMinimumRows: values.recommendedMinimumRows,
    strategy: values.strategy,
    requiredScenarios: values.requiredScenarios,
    selectedTemplateRows,
    coveredScenarioIds: values.coveredScenarioIds,
    missingScenarioIds: values.missingScenarioIds,
    coverageSummary: values.coverageSummary,
    warnings: values.warnings,
  });
}

/** @param {object} plan */
export function outputPlanContainsRawTemplates(plan) {
  return JSON.stringify(plan).includes('"template"') || JSON.stringify(plan).includes('"row"');
}
