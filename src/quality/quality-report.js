import { createDistributionComparison } from './distribution-comparison.js';
import { createCombinationRiskCheck } from './combination-risk.js';
import { isGeneratedResultDownloadable } from '../export/export-availability.js';
import { relationshipIsActive } from '../core/contracts.js';

function countIssues(issues, code) {
  return (issues ?? []).filter((issue) => issue.code === code).length;
}

function metric(label, value, measurement = 'EXACT') {
  return Object.freeze({ label, value, measurement });
}

function zone({ id, title, status, measurement, summary, metrics, notes = [], columns = [], notEvaluatedAreas = [] }) {
  return Object.freeze({
    id,
    title,
    status,
    measurement,
    summary,
    metrics: Object.freeze(metrics),
    notes: Object.freeze(notes),
    columns: Object.freeze(columns),
    notEvaluatedAreas: Object.freeze(notEvaluatedAreas),
  });
}

function resultSet(generationResult, datasetResult) {
  return datasetResult?.tableResults?.length > 0
    ? datasetResult.tableResults.map((table) => table.generationResult)
    : [generationResult];
}

function countResultFindings(results, collection, code) {
  return results.reduce((total, result) => total + countIssues(result?.[collection], code), 0);
}

export function overallQualityStatus(zones) {
  if (zones.some((entry) => entry.status === 'FAIL')) return 'FAIL';
  if (zones.some((entry) => entry.status === 'REVIEW')) return 'REVIEW';
  if (zones.every((entry) => entry.status === 'NOT_EVALUATED')) return 'NOT_EVALUATED';
  return 'PASS';
}

function structureZone({ generationResult, datasetResult }) {
  const results = resultSet(generationResult, datasetResult);
  const validation = datasetResult?.validation ?? generationResult.validation;
  const issueCount = results.reduce((total, result) => total + (result.validation?.issueCount ?? result.issues?.length ?? 0), 0);
  const explicitUniquenessCodes = [
    'OUTPUT_UNIQUENESS_VIOLATION',
    'GENERATED_UNIQUENESS_RELAXED',
    'GENERATED_UNIQUENESS_VIOLATION',
  ];
  const explicitUniquenessViolations = explicitUniquenessCodes.reduce((total, code) => total
    + countResultFindings(results, 'warnings', code)
    + countResultFindings(results, 'issues', code), 0);
  const duplicatePrimaryKeyCount = datasetResult?.validation?.duplicatePrimaryKeyCount ?? 0;
  const valid = Boolean(validation?.valid
    && results.every((result) => result.validation?.valid)
    && explicitUniquenessViolations === 0
    && duplicatePrimaryKeyCount === 0);
  const metrics = [
    metric('Output rows', datasetResult?.validation.totalRows ?? generationResult.rows.length),
    metric('Output columns', generationResult.headers.length),
    metric('Validation issues', issueCount),
    metric('Explicit uniqueness violations', explicitUniquenessViolations),
  ];
  const fidelity = generationResult.statistics?.businessFidelity;
  if (fidelity) {
    metrics.push(
      metric('Business pattern', fidelity === 'HIGH' ? 'High match' : fidelity === 'BALANCED' ? 'Balanced' : 'Flexible'),
      metric('Structured source rows', generationResult.statistics?.structuredSourceRowCount ?? 0),
    );
  }
  if (datasetResult) {
    metrics.push(
      metric('Project tables', datasetResult.validation.tableCount),
      metric('Orphan foreign keys', datasetResult.validation.orphanForeignKeyCount ?? 0),
      metric('Cardinality violations', datasetResult.validation.cardinalityViolationCount ?? 0),
      metric('Linked-rule violations', datasetResult.validation.crossTableRuleViolationCount ?? 0),
      metric('Duplicate primary-key rows', duplicatePrimaryKeyCount),
    );
  }
  return zone({
    id: 'structure',
    title: 'Structure & rules',
    status: valid ? 'PASS' : 'FAIL',
    measurement: 'EXACT',
    summary: valid
      ? 'Row count, column structure, configured rules, and linked-table checks passed.'
      : 'One or more declared output contracts failed. Inspect the evidence before using the result.',
    metrics,
  });
}

function coverageZone(outputPlan) {
  const summary = outputPlan.coverageSummary ?? {};
  const required = summary.requiredScenarioCount ?? outputPlan.requiredScenarios.length;
  const covered = summary.coveredScenarioCount ?? outputPlan.coveredScenarioIds.length;
  const missing = outputPlan.missingScenarioIds.length;
  if (required === 0) {
    return zone({
      id: 'coverage',
      title: 'Test coverage',
      status: 'NOT_EVALUATED',
      measurement: 'EXACT',
      summary: 'Source-derived scenario coverage was not evaluated because this result was generated from scratch.',
      metrics: [metric('Detected scenarios', 0), metric('Represented scenarios', 0)],
      notEvaluatedAreas: ['Source-derived scenario coverage'],
    });
  }
  const ratio = summary.weightedCoverageRatio ?? (required === 0 ? 1 : covered / required);
  return zone({
    id: 'coverage',
    title: 'Test coverage',
    status: missing === 0 ? 'PASS' : 'REVIEW',
    measurement: 'EXACT',
    summary: missing === 0
      ? 'Every detected test case has a representative output row.'
      : `${missing} detected test case${missing === 1 ? ' is' : 's are'} not represented in this output plan.`,
    metrics: [
      metric('Detected scenarios', required),
      metric('Represented scenarios', covered),
      metric('Weighted coverage', `${Math.round(ratio * 100)}%`),
      metric('Missing scenarios', missing),
    ],
    notes: summary.unavailableScenarioCount > 0
      ? ['Some test cases have no safe source row; adding output rows alone will not restore them.']
      : [],
  });
}

function distributionRelationshipZone({ relationshipRules = [], generationResult, datasetResult, distributionComparison }) {
  const enabledRelationships = relationshipRules.filter(relationshipIsActive).length;
  const candidateRelationships = relationshipRules.filter((rule) => rule.status === 'CANDIDATE').length;
  const informationalRelationships = relationshipRules.filter((rule) => rule.status === 'INFORMATIONAL').length;
  const results = resultSet(generationResult, datasetResult);
  const relationshipViolations = [
    'BUSINESS_RELATIONSHIP_VIOLATION',
    'DATE_RELATIONSHIP_VIOLATION',
    'SHIFT_GROUP_ORDER_VIOLATION',
    'SAME_ID_RELATIONSHIP_VIOLATION',
    'CODE_DESCRIPTION_VIOLATION',
  ].reduce((total, code) => total + countResultFindings(results, 'issues', code), 0)
    + (datasetResult?.validation.crossTableRuleViolationCount ?? 0)
    + (datasetResult?.validation.orphanForeignKeyCount ?? 0)
    + (datasetResult?.validation.cardinalityViolationCount ?? 0);
  const distributionStatus = distributionComparison?.status ?? 'NOT_EVALUATED';
  const automaticRelationships = generationResult.statistics?.businessRelationships ?? {};
  const fidelity = generationResult.statistics?.businessFidelity;
  const fidelitySettings = generationResult.statistics?.businessFidelitySettings ?? {};
  const rankAlignment = generationResult.statistics?.rankAlignment ?? {};
  const confirmedBusinessRules = automaticRelationships.confirmedRuleCount
    ?? automaticRelationships.detectedRuleCount
    ?? 0;
  const usesRankAlignment = fidelity === 'HIGH'
    && fidelitySettings.preserveNumericRelationships !== false
    && (rankAlignment.alignedColumnCount ?? 0) > 0;
  const fidelityMetrics = fidelity ? [
    metric('Confirmed exact business rules', confirmedBusinessRules),
    metric('Cells aligned to exact rules', automaticRelationships.appliedCellCount ?? 0),
    metric('Numeric columns rank-aligned', usesRankAlignment ? (rankAlignment.alignedColumnCount ?? 0) : 'Not used'),
    metric('Values rank-aligned', usesRankAlignment ? (rankAlignment.alignedCellCount ?? 0) : 'Not used'),
    metric('Source order protected', fidelitySettings.preserveRowOrder ? 'Yes' : 'No'),
  ] : [
    metric('Confirmed exact business rules', confirmedBusinessRules),
    metric('Cells aligned to exact rules', automaticRelationships.appliedCellCount ?? 0),
  ];
  const configuredRelationshipStatus = enabledRelationships === 0
    ? 'NOT EVALUATED'
    : relationshipViolations > 0 ? 'FAIL' : 'PASS';
  const status = relationshipViolations > 0
    ? 'FAIL'
    : distributionStatus === 'REVIEW'
      ? 'REVIEW'
      : distributionStatus === 'PASS' || enabledRelationships > 0
        ? 'PASS'
        : 'NOT_EVALUATED';
  const distributionSummary = distributionComparison
    ? distributionComparison.status === 'REVIEW'
      ? `${distributionComparison.reviewColumnCount} column${distributionComparison.reviewColumnCount === 1 ? '' : 's'} differed from the source beyond a visible review limit.`
      : distributionComparison.status === 'NOT_EVALUATED'
        ? 'Source distribution was not evaluated because no output columns retain a source-distribution contract.'
        : `${distributionComparison.comparableColumnCount} source column${distributionComparison.comparableColumnCount === 1 ? '' : 's'} were compared with the output.`
    : 'Source distribution was not evaluated because no source table was supplied.';
  const relationshipSummary = enabledRelationships > 0
    ? relationshipViolations === 0
      ? `${enabledRelationships} configured relationship contract${enabledRelationships === 1 ? '' : 's'} passed.`
      : 'One or more configured relationship contracts failed.'
    : 'Cross-column relationships were not configured and are not evaluated.';
  const notEvaluatedAreas = [
    ...(distributionStatus === 'NOT_EVALUATED' ? ['Source distribution'] : []),
    ...(enabledRelationships > 0 ? [] : ['Cross-column relationships']),
  ];
  return zone({
    id: 'distribution-relationships',
    title: 'Distribution & relationships',
    status,
    measurement: distributionStatus === 'NOT_EVALUATED' ? 'NOT EVALUATED' : `EXACT + ${distributionComparison.measurement}`,
    summary: `${relationshipSummary} ${distributionSummary}`,
    metrics: [
      metric('Enabled table rules', enabledRelationships),
      metric('Pending evidence candidates', candidateRelationships),
      metric('Informational column-name hints', informationalRelationships),
      metric('Configured relationship contract', configuredRelationshipStatus, enabledRelationships > 0 ? 'EXACT' : 'NOT_EVALUATED'),
      ...fidelityMetrics,
      metric('Relationship violations', relationshipViolations),
      metric('Source columns compared', distributionComparison?.comparableColumnCount ?? 0, distributionComparison ? distributionComparison.measurement : 'NOT_EVALUATED'),
      metric('Columns outside tolerance', distributionComparison?.reviewColumnCount ?? 0, distributionComparison ? distributionComparison.measurement : 'NOT_EVALUATED'),
      metric('Output rows profiled', distributionComparison
        ? `${distributionComparison.profiledOutputRows} of ${distributionComparison.totalOutputRows}`
        : 'N/A', distributionComparison?.measurement ?? 'NOT_EVALUATED'),
    ],
    columns: distributionComparison?.columns ?? [],
    notes: [
      distributionComparison
        ? 'Review when blanks or categories exceed their visible limits, or numeric support, mean, P1-P99 quantiles, tails, range, or required High-match extremes fall outside the adaptive source-driven checks.'
        : 'From-scratch output has no source distribution to compare.',
      distributionComparison?.boundary ?? 'No single synthetic quality score is inferred. Each measurable check is shown separately.',
      ...(distributionComparison?.domainChangedColumnCount > 0
        ? [`${distributionComparison.domainChangedColumnCount} column${distributionComparison.domainChangedColumnCount === 1 ? '' : 's'} intentionally left the source value domain under REPLACE, PATTERN_REPLACE, GENERALISE, or TEXT_SANITISE. Synthetic labels are not claims of real domain validity.`]
        : []),
      fidelity === 'HIGH'
        ? 'High match protects source row order. Numeric rank alignment is used only when a confirmed numeric relationship is active; closer structure increases disclosure risk.'
        : fidelity === 'BALANCED'
          ? 'Balanced preserves confirmed exact rules and common structure. Unconfirmed candidates and column-name hints do not control generation, and it does not claim exact source-row correspondence.'
          : 'Flexible prioritises coverage and resizing freedom; it does not claim exact source-row correspondence.',
    ],
    notEvaluatedAreas,
  });
}

function privacyZone({ analysis, policies = [], generationResult, combinationRisk }) {
  const highRiskColumns = policies.filter((policy) => policy.riskLevel === 'HIGH').length;
  const highRiskKeep = policies.filter((policy) => policy.riskLevel === 'HIGH' && policy.selectedAction === 'KEEP').length;
  const recognisedAustralianIdentifiers = (analysis?.detections ?? []).filter((detection) => detection.type.startsWith('AU_')).length;
  const sourceReuseFindings = [
    ...(generationResult.issues ?? []),
    ...(generationResult.warnings ?? []),
  ].filter((finding) => finding.code === 'OUTPUT_SOURCE_VALUE_REUSE');
  const highRiskSourceReuse = sourceReuseFindings.filter((finding) => (
    finding.details?.protectedIdentifier === true
    || finding.details?.riskLevel === 'HIGH'
    || finding.details?.attributeRole === 'DIRECT_IDENTIFIER'
    || finding.details === undefined
  )).length;
  const otherSourceReuse = sourceReuseFindings.length - highRiskSourceReuse;
  const sourceReuse = sourceReuseFindings.length;
  const internalLeaks = countIssues(generationResult.issues, 'INTERNAL_TEMPLATE_LEAK');
  const sanitisationWarnings = (generationResult.warnings ?? []).filter((warning) => warning.code === 'TEXT_SANITISATION_REQUIRES_REVIEW').length;
  const roleCounts = Object.freeze({
    DIRECT_IDENTIFIER: policies.filter((policy) => policy.attributeRole === 'DIRECT_IDENTIFIER').length,
    QUASI_IDENTIFIER: policies.filter((policy) => policy.attributeRole === 'QUASI_IDENTIFIER').length,
    SENSITIVE_ATTRIBUTE: policies.filter((policy) => policy.attributeRole === 'SENSITIVE_ATTRIBUTE').length,
    ORDINARY: policies.filter((policy) => (policy.attributeRole ?? 'ORDINARY') === 'ORDINARY').length,
  });
  const userConfirmedRoles = policies.filter((policy) => policy.attributeRoleSource === 'USER').length;
  const sensitiveFinding = sourceReuse > 0;
  const check = highRiskKeep > 0 || sanitisationWarnings > 0 || combinationRisk.status === 'CHECK';
  const status = internalLeaks > 0 ? 'FAIL' : sensitiveFinding || check ? 'REVIEW' : 'PASS';
  return zone({
    id: 'privacy',
    title: 'Privacy & leakage',
    status,
    measurement: 'EXACT + SAMPLED',
    summary: internalLeaks > 0
      ? 'An internal generation marker reached the output, so a declared safety contract failed.'
      : sensitiveFinding
      ? highRiskSourceReuse > 0
        ? 'A high-risk or protected field reproduced bounded source evidence. Review the affected field before using the file.'
        : 'A lower-risk replacement reproduced bounded source evidence. Review the affected field in its actual data context.'
      : check
        ? 'No bounded identifier leak was found, but one or more privacy decisions still require review.'
        : 'No protected source values or internal markers were found in the output.',
    metrics: [
      metric('High-risk columns', highRiskColumns),
      metric('Direct identifiers', roleCounts.DIRECT_IDENTIFIER),
      metric('Quasi-identifiers', roleCounts.QUASI_IDENTIFIER),
      metric('Sensitive attributes', roleCounts.SENSITIVE_ATTRIBUTE),
      metric('Ordinary fields', roleCounts.ORDINARY),
      metric('User-confirmed roles', userConfirmedRoles),
      metric('High-risk KEEP decisions', highRiskKeep),
      metric('Checksum-verified AU identifier columns', recognisedAustralianIdentifiers),
      metric('High-risk source-value reuse findings', highRiskSourceReuse, 'SAMPLED'),
      metric('Other source-value reuse findings', otherSourceReuse, 'SAMPLED'),
      metric('Internal template leaks', internalLeaks),
      metric('Text sanitisation review warnings', sanitisationWarnings),
      metric('Quasi-identifier columns combined', combinationRisk.quasiIdentifierColumns.length, combinationRisk.measurement),
      metric('Smallest output group', combinationRisk.smallestGroupSize ?? 'N/A', combinationRisk.measurement),
      metric(`Rows in groups smaller than ${combinationRisk.minimumGroupSize}`, combinationRisk.rowsInSmallGroups, combinationRisk.measurement),
    ],
    notes: [
      combinationRisk.summary,
      combinationRisk.boundary,
      'Source-value reuse is checked only for non-blank output values against bounded profile evidence; blank-to-blank matches are excluded.',
      'Reuse findings are separated by field risk. A public lookup or aggregate table is not, by itself, evidence of personal re-identification risk.',
      'Pattern-based free-text sanitisation is best effort and can miss context-specific names, facts, or identifiers.',
    ],
  });
}

export function createQualityReport({
  analysis = null,
  policies = [],
  relationshipRules = [],
  generationResult,
  datasetResult = null,
  probe = false,
} = {}) {
  if (!generationResult) throw new TypeError('generationResult is required.');
  const distributionComparison = analysis?.tableProfile
    ? createDistributionComparison({
      sourceTableProfile: analysis.tableProfile,
      policies,
      generationResult,
    })
    : null;
  const combinationRisk = probe
    ? createCombinationRiskCheck({ policies: [], generationResult })
    : createCombinationRiskCheck({ policies, generationResult });
  const zones = Object.freeze([
    structureZone({ generationResult, datasetResult }),
    coverageZone(generationResult.outputPlan),
    distributionRelationshipZone({ relationshipRules, generationResult, datasetResult, distributionComparison }),
    privacyZone({ analysis, policies, generationResult, combinationRisk }),
  ]);
  const notEvaluatedAreas = Object.freeze([...new Set(zones.flatMap((entry) => entry.notEvaluatedAreas ?? []))]);
  return Object.freeze({
    schemaVersion: 2,
    kind: probe ? 'PROBE' : 'FULL_OUTPUT',
    exportEligible: isGeneratedResultDownloadable({ generationResult, probe }),
    overallStatus: overallQualityStatus(zones),
    notEvaluatedAreas,
    boundary: 'These checks do not certify anonymisation or measure formal disclosure risk. They also do not infer that a public lookup or aggregate table contains personal records.',
    zones,
  });
}

export function serializeQualityReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
