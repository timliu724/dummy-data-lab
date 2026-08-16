import { createContractWarning } from '../core/contracts.js';
import { validateRequestedRowCount } from '../core/contracts.js';
import { DEFAULT_OUTPUT_ROW_COUNT } from '../core/constants.js';
import { createCoverageOutputPlan } from './output-plan.js';

/** @param {readonly object[]} selected @param {number} requestedRowCount */
function allocatePlannedUses(selected, requestedRowCount) {
  if (selected.length === 0) return [];
  const allocations = selected.map((candidate) => ({ candidate, plannedUseCount: 1 }));
  let remaining = Math.max(0, requestedRowCount - selected.length);
  const totalWeight = selected.reduce((sum, candidate) => sum + Math.max(candidate.distributionWeight ?? 1, 0.0001), 0);
  const fractional = [];
  allocations.forEach((allocation, index) => {
    const exactShare = remaining * Math.max(allocation.candidate.distributionWeight ?? 1, 0.0001) / totalWeight;
    const whole = Math.floor(exactShare);
    allocation.plannedUseCount += whole;
    fractional.push({ index, fraction: exactShare - whole });
  });
  let assigned = allocations.reduce((sum, allocation) => sum + allocation.plannedUseCount, 0);
  fractional.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; assigned < requestedRowCount; index = (index + 1) % fractional.length) {
    allocations[fractional[index].index].plannedUseCount += 1;
    assigned += 1;
  }
  return allocations;
}

/**
 * Greedy weighted set-cover followed by representative fill and proportional
 * template reuse. One candidate row may cover many scenarios.
 *
 * @param {Object} values
 */
export function planCoverage({
  scenarios,
  candidates,
  matchedScenarioIds = null,
  scenarioRepresentativeLimitReached = false,
  requestedRowCount = DEFAULT_OUTPUT_ROW_COUNT,
  inputRowCount = null,
  strategy = 'COVERAGE_FIRST',
}) {
  validateRequestedRowCount(requestedRowCount);
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const uncovered = new Set(scenarioById.keys());
  const available = [...candidates];
  const fullCoverageSelection = [];

  while (uncovered.size > 0) {
    let bestCandidate = null;
    let bestGain = 0;
    for (const candidate of available) {
      if (fullCoverageSelection.includes(candidate)) continue;
      const gain = candidate.scenarioIds
        .filter((id) => uncovered.has(id))
        .reduce((sum, id) => sum + (scenarioById.get(id)?.weight ?? 1), 0);
      const score = gain + (candidate.representativenessScore ?? 0) * 0.01;
      if (gain > 0 && score > bestGain) {
        bestGain = score;
        bestCandidate = candidate;
      }
    }
    if (!bestCandidate) break;
    fullCoverageSelection.push(bestCandidate);
    for (const id of bestCandidate.scenarioIds) uncovered.delete(id);
  }

  const unmatchableScenarioIds = [...uncovered];
  const unmatchableScenarioSet = new Set(unmatchableScenarioIds);
  const recommendedMinimumRows = fullCoverageSelection.length;
  const selected = fullCoverageSelection.slice(0, requestedRowCount);
  if (selected.length < requestedRowCount) {
    const remainingCandidates = available
      .filter((candidate) => !selected.includes(candidate))
      .sort((left, right) => (
        (right.representativenessScore ?? 0) - (left.representativenessScore ?? 0) ||
        (left.priority ?? 0) - (right.priority ?? 0)
      ));
    selected.push(...remainingCandidates.slice(0, requestedRowCount - selected.length));
  }

  const covered = new Set(selected.flatMap((candidate) => candidate.scenarioIds).filter((id) => scenarioById.has(id)));
  const missingScenarioIds = scenarios.map((scenario) => scenario.id).filter((id) => !covered.has(id));
  const unavailableScenarioIds = missingScenarioIds.filter((id) => unmatchableScenarioSet.has(id));
  const rowBudgetMissingScenarioIds = missingScenarioIds.filter((id) => !unmatchableScenarioSet.has(id));
  const matchedScenarioSet = Array.isArray(matchedScenarioIds) ? new Set(matchedScenarioIds) : null;
  const sourceUnmatchedScenarioIds = matchedScenarioSet
    ? unavailableScenarioIds.filter((id) => !matchedScenarioSet.has(id))
    : [];
  const candidateCapacityMissingScenarioIds = matchedScenarioSet
    ? unavailableScenarioIds.filter((id) => matchedScenarioSet.has(id))
    : [];
  const warnings = [];
  if (requestedRowCount < recommendedMinimumRows) {
    warnings.push(createContractWarning(
      'REQUESTED_ROWS_BELOW_COVERAGE_MINIMUM',
      'The requested output cannot cover every important scenario found by the greedy planner.',
      { requestedRowCount, recommendedMinimumRows, missingScenarioCount: rowBudgetMissingScenarioIds.length },
    ));
  }
  if (rowBudgetMissingScenarioIds.length > 0) {
    warnings.push(createContractWarning(
      'SCENARIOS_MAY_BE_MISSING',
      'One or more representable scenarios were left out because the requested output row count is too small.',
      { missingScenarioIds: Object.freeze([...rowBudgetMissingScenarioIds]) },
    ));
  }
  if (unavailableScenarioIds.length > 0) {
    const message = sourceUnmatchedScenarioIds.length > 0
      ? 'One or more detected test cases could not be confirmed against a source row during the full scan.'
      : scenarioRepresentativeLimitReached || candidateCapacityMissingScenarioIds.length > 0
        ? 'One or more matched test cases exceeded the safe representative limit.'
        : 'One or more detected test cases have no safe source row.';
    warnings.push(createContractWarning(
      'SCENARIOS_UNAVAILABLE_IN_BOUNDED_TEMPLATES',
      message,
      {
        missingScenarioIds: Object.freeze([...unavailableScenarioIds]),
        sourceUnmatchedScenarioIds: Object.freeze([...sourceUnmatchedScenarioIds]),
        candidateCapacityMissingScenarioIds: Object.freeze([...candidateCapacityMissingScenarioIds]),
        scenarioRepresentativeLimitReached: Boolean(scenarioRepresentativeLimitReached),
      },
    ));
  }
  if (selected.length === 0) {
    warnings.push(createContractWarning(
      'NO_TEMPLATE_CANDIDATES',
      'No bounded candidate templates were available for the requested output.',
      {},
    ));
  } else if (requestedRowCount > selected.length) {
    warnings.push(createContractWarning(
      'TEMPLATE_REUSE_REQUIRED',
      'The generator must create multiple transformed rows from some representative templates.',
      { requestedRowCount, uniqueTemplateCount: selected.length },
    ));
  }

  const allocations = allocatePlannedUses(selected, requestedRowCount);
  const selectedCandidates = allocations.map(({ candidate, plannedUseCount }) => Object.freeze({
    ...candidate,
    score: candidate.coverageWeight + candidate.representativenessScore,
    plannedUseCount,
  }));
  const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  const coveredWeight = scenarios.filter((scenario) => covered.has(scenario.id)).reduce((sum, scenario) => sum + scenario.weight, 0);

  return createCoverageOutputPlan({
    inputRowCount,
    requestedRowCount,
    recommendedMinimumRows,
    strategy,
    requiredScenarios: scenarios,
    selectedCandidates,
    coveredScenarioIds: [...covered],
    missingScenarioIds,
    coverageSummary: Object.freeze({
      requiredScenarioCount: scenarios.length,
      representableScenarioCount: scenarios.length - unavailableScenarioIds.length,
      coveredScenarioCount: covered.size,
      missingScenarioCount: missingScenarioIds.length,
      rowBudgetMissingScenarioCount: rowBudgetMissingScenarioIds.length,
      unavailableScenarioCount: unavailableScenarioIds.length,
      sourceUnmatchedScenarioCount: sourceUnmatchedScenarioIds.length,
      candidateCapacityMissingScenarioCount: candidateCapacityMissingScenarioIds.length,
      scenarioRepresentativeLimitReached: Boolean(scenarioRepresentativeLimitReached),
      weightedCoverageRatio: totalWeight === 0 ? 1 : coveredWeight / totalWeight,
      uniqueTemplateCount: selected.length,
      plannedOutputRowCount: allocations.reduce((sum, allocation) => sum + allocation.plannedUseCount, 0),
      templateReuseRequired: requestedRowCount > selected.length,
      cartesianProductAttempted: false,
    }),
    warnings,
  });
}
