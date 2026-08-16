import { createInfoTooltip } from './info-tooltip.js';

export function coverageSummaryModel(outputPlan) {
  const missing = outputPlan.missingScenarioIds.length;
  const belowRecommended = outputPlan.requestedRowCount < outputPlan.recommendedMinimumRows;
  const unavailable = outputPlan.coverageSummary.unavailableScenarioCount
    ?? (belowRecommended ? 0 : missing);
  return Object.freeze({
    required: outputPlan.coverageSummary.requiredScenarioCount ?? outputPlan.requiredScenarios.length,
    covered: outputPlan.coverageSummary.coveredScenarioCount ?? outputPlan.coveredScenarioIds.length,
    missing,
    unavailable,
    sourceUnmatched: outputPlan.coverageSummary.sourceUnmatchedScenarioCount ?? 0,
    candidateCapacityMissing: outputPlan.coverageSummary.candidateCapacityMissingScenarioCount ?? 0,
    scenarioRepresentativeLimitReached: Boolean(outputPlan.coverageSummary.scenarioRepresentativeLimitReached),
    rowBudgetMissing: outputPlan.coverageSummary.rowBudgetMissingScenarioCount
      ?? Math.max(0, missing - unavailable),
    ratio: outputPlan.coverageSummary.weightedCoverageRatio ?? 0,
    recommendedMinimumRows: outputPlan.recommendedMinimumRows,
    requestedRowCount: outputPlan.requestedRowCount,
    belowRecommended,
  });
}

function missingScenarioLabels(outputPlan, maximum = 4) {
  const missing = new Set(outputPlan.missingScenarioIds);
  return outputPlan.requiredScenarios
    .filter((scenario) => missing.has(scenario.id))
    .slice(0, maximum)
    .map((scenario) => {
      const columns = scenario.columnNames.length > 0 ? scenario.columnNames.join(' + ') : 'Table relationship';
      const kind = scenario.kind.toLocaleLowerCase().replaceAll('_', ' ');
      return `${columns}: ${kind}`;
    });
}

export function coverageNotice(outputPlan) {
  const model = coverageSummaryModel(outputPlan);
  if (model.rowBudgetMissing > 0) {
    return `${model.requestedRowCount} output rows are below the ${model.recommendedMinimumRows}-row recommendation; ${model.rowBudgetMissing} detectable test cases may be left out.`;
  }
  if (model.unavailable > 0) {
    const labels = missingScenarioLabels(outputPlan);
    const detail = labels.length > 0 ? ` Missing: ${labels.join('; ')}${model.unavailable > labels.length ? '; …' : '.'}` : '';
    const reason = model.sourceUnmatched > 0
      ? `${model.sourceUnmatched} detected test cases could not be confirmed against a source row during the full scan.`
      : model.candidateCapacityMissing > 0 || model.scenarioRepresentativeLimitReached
        ? `${model.unavailable} matched test cases exceeded the safe representative limit.`
        : `The generator could not find a safe source row for ${model.unavailable} detected test cases.`;
    return `${reason} Adding more output rows will not fix this.${detail}`;
  }
  return null;
}

export function renderCoverageSummary(container, outputPlan) {
  const model = coverageSummaryModel(outputPlan);
  const documentRef = container.ownerDocument;
  const summary = documentRef.createElement('div');
  summary.className = `coverage-gauge${model.belowRecommended || model.unavailable > 0 ? ' is-warning' : ''}`;
  const number = documentRef.createElement('strong');
  number.textContent = `${model.covered}/${model.required}`;
  const label = documentRef.createElement('span');
  label.textContent = 'detected test cases represented';
  const help = createInfoTooltip(documentRef, {
    label: 'What detected test cases means',
    content: 'Test cases are bounded structural situations such as blanks, common or rare categories, value shapes, boundaries, and confirmed relationships. Free text is grouped by structure, not counted one value at a time. This is coverage, not the number of rows exported.',
    placement: 'below-right',
  });
  summary.append(number, label, help);
  const details = documentRef.createElement('p');
  const detailParts = [`Requested ${model.requestedRowCount}`];
  if (model.required > 0 && model.covered === model.required) {
    detailParts.push(`${model.recommendedMinimumRows} carefully selected rows can represent all ${model.required} detected test cases; the export will still contain ${model.requestedRowCount} rows`);
  } else if (model.rowBudgetMissing > 0) {
    detailParts.push(`recommended minimum ${model.recommendedMinimumRows}; ${model.rowBudgetMissing} detectable test cases may be left out because the output is too small`);
  } else {
    detailParts.push(`${model.recommendedMinimumRows} carefully selected rows can cover the test cases currently available`);
  }
  if (model.unavailable > 0) {
    detailParts.push(`${model.unavailable} test cases have no safe source row; adding output rows will not fix this`);
  }
  details.textContent = `${detailParts.join('. ')}.`;
  container.replaceChildren(summary, details);
}
