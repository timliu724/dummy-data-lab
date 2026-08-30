import { createContractWarning, createGenerationResult } from '../core/contracts.js';
import { DEFAULT_MODE } from '../core/constants.js';
import { applyMode } from '../modes/apply-mode.js';
import { validatePoliciesForGeneration } from '../policy/policy-validation.js';
import { RelationshipRegistry } from '../relationships/relationship-registry.js';
import { validateOutput } from '../validation/validate-output.js';
import { BasicProvider } from './basic-provider.js';
import { DateShiftContext } from './date-shift-context.js';
import { DistributionSamplerContext, sampleDistribution } from './distribution-sampler.js';
import { MappingContext } from './mapping-context.js';
import { createRandomSource } from './random-source.js';
import { transformRow } from './transform-row.js';
import { parseTemplateDescriptor } from './template-descriptors.js';
import { valueShape } from '../detection/pattern-utils.js';
import {
  DEFAULT_BUSINESS_FIDELITY,
  normaliseBusinessFidelity,
  normaliseBusinessFidelitySettings,
} from '../business/fidelity.js';
import { BusinessRelationshipPreserver } from '../business/relationship-preserver.js';
import { alignGeneratedNumericRanks } from '../business/rank-correlation.js';

function deduplicateWarnings(warnings) {
  const seen = new Set();
  return Object.freeze(warnings.filter((warning) => {
    const key = `${warning.code}:${JSON.stringify(warning.details ?? {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function candidateMap(candidateTemplates, maxCandidateTemplates) {
  if (!Array.isArray(candidateTemplates)) throw new TypeError('candidateTemplates must be an array.');
  if (candidateTemplates.length > maxCandidateTemplates) {
    throw new RangeError(`candidateTemplates exceeds the bounded limit of ${maxCandidateTemplates}.`);
  }
  return new Map(candidateTemplates.map((candidate) => {
    if (!Number.isInteger(candidate.sourceRowIndex) || !Array.isArray(candidate.template)) {
      throw new TypeError('Each candidate template requires sourceRowIndex and a template array.');
    }
    return [candidate.sourceRowIndex, candidate.template];
  }));
}

function syntheticTemplate(profiles, policies, random) {
  return policies.map((policy, columnIndex) => {
    const profile = profiles[columnIndex] ?? {};
    const sampled = sampleDistribution({ profile, detectedType: policy.detectedType, random });
    return sampled === undefined || sampled === null ? '' : sampled;
  });
}

function buildSchedule(outputPlan) {
  const schedule = [];
  const references = outputPlan.selectedTemplateRows ?? [];
  for (const reference of references) {
    const uses = Math.max(0, reference.plannedUseCount ?? 1);
    for (let useOrdinal = 0; useOrdinal < uses && schedule.length < outputPlan.requestedRowCount; useOrdinal += 1) {
      schedule.push(Object.freeze({ reference, useOrdinal }));
    }
  }
  let cursor = 0;
  while (schedule.length < outputPlan.requestedRowCount) {
    const reference = references.length > 0 ? references[cursor % references.length] : null;
    schedule.push(Object.freeze({ reference, useOrdinal: references.length > 0 ? Math.floor(cursor / references.length) + 1 : cursor }));
    cursor += 1;
  }
  return schedule;
}

function buildSourceSchedule(sourceEntries, requestedRowCount) {
  if (!Array.isArray(sourceEntries) || sourceEntries.length === 0) return Object.freeze([]);
  const schedule = [];
  let cursor = 0;
  while (schedule.length < requestedRowCount) {
    const entry = sourceEntries[cursor % sourceEntries.length];
    schedule.push(Object.freeze({
      reference: Object.freeze({ sourceRowIndex: entry.sourceRowIndex }),
      originalRow: entry.row,
      sourceRowIndex: entry.sourceRowIndex,
      useOrdinal: Math.floor(cursor / sourceEntries.length),
    }));
    cursor += 1;
  }
  return Object.freeze(schedule);
}

const NON_REMEDIABLE_VALIDATION_CODES = new Set([
  'BUSINESS_RELATIONSHIP_VIOLATION',
  'DATE_RELATIONSHIP_VIOLATION',
  'SHIFT_GROUP_ORDER_VIOLATION',
]);

const UNIQUE_IDENTIFIER_TYPES = new Set(['NUMERIC_ID', 'ALPHANUMERIC_CODE', 'EMAIL', 'PHONE_LIKE']);

export function validateDeterministicUniqueCapacity({ outputPlan, policies, profiles, uniqueColumns = [] }) {
  const strictUniqueColumns = new Set(uniqueColumns);
  const blocked = policies.flatMap((policy, index) => {
    const profile = profiles[index] ?? {};
    const deterministic = ['KEEP', 'SHIFT'].includes(policy.selectedAction);
    const inferredUnique = UNIQUE_IDENTIFIER_TYPES.has(policy.detectedType) && (profile.uniqueRatio ?? 0) >= 0.98;
    const exact = profile.uniqueCountStatus === 'EXACT' && Number.isInteger(profile.uniqueCount);
    const noBlankFallback = (profile.emptyCount ?? 0) === 0;
    return strictUniqueColumns.has(policy.columnName)
      && deterministic && inferredUnique && exact && noBlankFallback && outputPlan.requestedRowCount > profile.uniqueCount
      ? [{ columnName: policy.columnName, action: policy.selectedAction, availableUniqueValues: profile.uniqueCount }]
      : [];
  });
  const warnings = blocked.map((entry) => createContractWarning(
    'EXPLICIT_UNIQUENESS_CAPACITY_RELAXED',
    'The requested row count exceeds the available distinct values, so repeated values will be generated and reported for review.',
    {
      columnName: entry.columnName,
      action: entry.action,
      requestedRowCount: outputPlan.requestedRowCount,
      availableUniqueValues: entry.availableUniqueValues,
    },
  ));
  return Object.freeze({ valid: true, warnings: Object.freeze(warnings) });
}

function hasNonRemediableIssue(validation, policies) {
  const policyByName = new Map(policies.map((policy) => [policy.columnName, policy]));
  return validation.issues.some((issue) => {
    if (NON_REMEDIABLE_VALIDATION_CODES.has(issue.code)) return true;
    if (issue.code !== 'OUTPUT_UNIQUENESS_VIOLATION') return false;
    return ['KEEP', 'SHIFT'].includes(policyByName.get(issue.details?.columnName)?.selectedAction);
  });
}

/**
 * Generates only OutputPlan.requestedRowCount rows from bounded templates.
 * It never accepts or iterates the complete source table.
 */
export function generateOutput({
  outputPlan,
  headers,
  policies,
  profiles = [],
  detections = [],
  candidateTemplates = [],
  sourceEntries = null,
  businessRelationshipRules = [],
  sourceNumericRankData = null,
  relationshipRules = [],
  jointSamplingGroups = [],
  mode = DEFAULT_MODE,
  businessFidelity = DEFAULT_BUSINESS_FIDELITY,
  businessFidelitySettings = null,
  random = createRandomSource(),
  options = {},
  maxCandidateTemplates = 512,
  maxRemediationAttempts = 3,
  validationOptions = {},
}) {
  if (!outputPlan || typeof outputPlan !== 'object') throw new TypeError('outputPlan is required.');
  if (!Array.isArray(headers) || !Array.isArray(policies)) throw new TypeError('headers and policies are required.');
  if (!Number.isInteger(maxCandidateTemplates) || maxCandidateTemplates <= 0) throw new RangeError('maxCandidateTemplates must be positive.');
  if (!Number.isInteger(maxRemediationAttempts) || maxRemediationAttempts < 0 || maxRemediationAttempts > 10) {
    throw new RangeError('maxRemediationAttempts must be an integer from 0 to 10.');
  }

  const templates = candidateMap(candidateTemplates, maxCandidateTemplates);
  const fidelity = normaliseBusinessFidelity(businessFidelity);
  const fidelitySettings = normaliseBusinessFidelitySettings(fidelity, businessFidelitySettings ?? {});
  const modeResult = applyMode(mode, policies);
  const activeRelationshipRules = fidelitySettings.preserveRelationships ? relationshipRules : [];
  const activeBusinessRelationshipRules = fidelitySettings.preserveNumericRelationships
    ? businessRelationshipRules
    : [];
  const activeJointSamplingGroups = fidelitySettings.preserveRelationships ? jointSamplingGroups : [];
  const relationshipRegistry = new RelationshipRegistry({ rules: activeRelationshipRules });
  const businessRelationshipPreserver = new BusinessRelationshipPreserver({
    rules: activeBusinessRelationshipRules,
  });
  const policyValidation = validatePoliciesForGeneration({
    headers,
    policies: modeResult.policies,
    mode,
    relationshipRegistry,
  });
  const uniqueCapacityReview = validateDeterministicUniqueCapacity({
    outputPlan,
    policies: modeResult.policies,
    profiles,
    uniqueColumns: validationOptions.uniqueColumns ?? [],
  });
  const mappingContext = new MappingContext({
    maxAttempts: Math.min(2048, Math.max(64, outputPlan.requestedRowCount * 2)),
  });
  const basicProvider = new BasicProvider({ random });
  const dateShiftContext = new DateShiftContext({ random });
  const distributionSampler = new DistributionSamplerContext({
    random,
    outputRowCount: outputPlan.requestedRowCount,
    businessFidelity: fidelity,
  });
  const usingStructuredSource = Array.isArray(sourceEntries) && sourceEntries.length > 0;
  const jointSamplingColumnIndexes = new Set(
    usingStructuredSource
      ? activeJointSamplingGroups.flatMap((group) => group.columnIndexes ?? [])
      : [],
  );
  const schedule = usingStructuredSource
    ? buildSourceSchedule(sourceEntries, outputPlan.requestedRowCount)
    : buildSchedule(outputPlan);
  const sourcePreviewReferences = Object.freeze(schedule.slice(0, 100).map((scheduled, outputRowIndex) => Object.freeze({
    outputRowIndex,
    sourceRowIndex: scheduled.reference?.sourceRowIndex ?? null,
  })));
  const generatedRows = new Array(outputPlan.requestedRowCount);
  const expectedPatternShapesByRow = new Array(outputPlan.requestedRowCount);
  const rowWarnings = [];
  let outputHeaders = null;

  const generateScheduledRow = (rowIndex, retryIndex = 0) => {
    const scheduled = schedule[rowIndex];
    const sourceRowIndex = scheduled.sourceRowIndex ?? scheduled.reference?.sourceRowIndex ?? null;
    const template = sourceRowIndex === null ? null : templates.get(sourceRowIndex);
    const originalRow = scheduled.originalRow ?? template ?? syntheticTemplate(profiles, modeResult.policies, random);
    expectedPatternShapesByRow[rowIndex] = Object.freeze(Object.fromEntries(modeResult.policies.flatMap((policy, columnIndex) => {
      if (policy.selectedAction !== 'PATTERN_REPLACE') return [];
      const sourceValue = originalRow[columnIndex];
      const descriptor = parseTemplateDescriptor(sourceValue);
      const placeholder = String(sourceValue ?? '').match(/^<PATTERN:(.*)>$/s);
      const expectedShape = descriptor?.action === 'PATTERN_REPLACE'
        ? descriptor.shape
        : placeholder
          ? placeholder[1]
          : valueShape(String(sourceValue ?? ''));
      return [[policy.columnName, expectedShape]];
    })));
    const context = Object.freeze({
      random,
      mappingContext,
      basicProvider,
      dateShiftContext,
      distributionSampler,
      relationshipRegistry,
      businessRelationshipPreserver,
      sourceRowIndex,
      outputRowIndex: rowIndex,
      entityKey: `generated:${rowIndex}:retry:${retryIndex}`,
      forceUniqueInstance: scheduled.useOrdinal > 0 || retryIndex > 0,
      options: Object.freeze({
        preserveIntervals: true,
        preserveDistribution: true,
        businessFidelity: fidelity,
        businessFidelitySettings: fidelitySettings,
        jointSamplingColumnIndexes,
        deferBusinessRelationships: true,
        ...options,
      }),
    });
    const result = transformRow({
      row: originalRow,
      headers,
      policies: modeResult.policies,
      profiles,
      detections,
      context,
    });
    outputHeaders ??= result.headers;
    if (result.headers.join('\u0000') !== outputHeaders.join('\u0000')) {
      throw new Error('DROP actions produced an inconsistent output schema.');
    }
    generatedRows[rowIndex] = result.row;
    rowWarnings.push(...result.warnings);
  };

  for (let rowIndex = 0; rowIndex < generatedRows.length; rowIndex += 1) generateScheduledRow(rowIndex);
  outputHeaders ??= Object.freeze([]);

  let rankAlignment = Object.freeze({ alignedColumnCount: 0, alignedCellCount: 0 });
  const applyAutomaticBusinessStructure = () => {
    rankAlignment = fidelitySettings.preserveNumericRelationships
      ? alignGeneratedNumericRanks({
          sourceHeaders: headers,
          outputHeaders,
          generatedRows,
          sourceNumericRankData,
        })
      : Object.freeze({ alignedColumnCount: 0, alignedCellCount: 0 });
    businessRelationshipPreserver.resetStatistics();
    if (!fidelitySettings.preserveNumericRelationships) return;
    for (let rowIndex = 0; rowIndex < generatedRows.length; rowIndex += 1) {
      const related = businessRelationshipPreserver.applyToRow({
        outputHeaders,
        transformedRow: generatedRows[rowIndex],
      });
      generatedRows[rowIndex] = related.row;
      rowWarnings.push(...related.warnings);
    }
  };
  applyAutomaticBusinessStructure();

  let validation = validateOutput({
    outputPlan,
    headers: outputHeaders,
    rows: generatedRows,
    policies: modeResult.policies,
    profiles,
    detections,
    relationshipRules: relationshipRegistry.rules,
    expectedPatternShapesByRow,
    ...validationOptions,
  });
  let remediationAttempts = 0;
  while (!validation.valid
    && !hasNonRemediableIssue(validation, modeResult.policies)
    && validation.invalidRowIndexes.length > 0
    && remediationAttempts < maxRemediationAttempts) {
    remediationAttempts += 1;
    for (const rowIndex of validation.invalidRowIndexes) generateScheduledRow(rowIndex, remediationAttempts);
    applyAutomaticBusinessStructure();
    validation = validateOutput({
      outputPlan,
      headers: outputHeaders,
      rows: generatedRows,
      policies: modeResult.policies,
      profiles,
      detections,
      relationshipRules: relationshipRegistry.rules,
      expectedPatternShapesByRow,
      ...validationOptions,
    });
  }
  const blockedByDeterministicRule = hasNonRemediableIssue(validation, modeResult.policies);

  const mappingStatistics = mappingContext.statistics();
  const warnings = deduplicateWarnings([
    ...(outputPlan.warnings ?? []),
    ...(uniqueCapacityReview.warnings ?? []),
    ...modeResult.warnings,
    ...policyValidation.warnings,
    ...relationshipRegistry.warnings(),
    ...rowWarnings,
    ...validation.warnings,
    ...(mappingStatistics.uniqueness.relaxedCollisionCount > 0 ? [createContractWarning(
      'MAPPING_UNIQUENESS_RELAXED',
      'Some automatically unique replacement mappings exhausted their available values, so duplicate synthetic values were allowed and generation continued.',
      {
        relaxedCollisionCount: mappingStatistics.uniqueness.relaxedCollisionCount,
        relaxedScopeCount: mappingStatistics.uniqueness.relaxedScopeCount,
        outputRowCount: generatedRows.length,
      },
    )] : []),
  ]);
  return createGenerationResult({
    outputPlan,
    headers: outputHeaders,
    rows: generatedRows.map((row) => Object.freeze([...row])),
    issues: validation.issues,
    warnings,
    sourcePreviewReferences,
    validation: Object.freeze({
      valid: validation.valid,
      issueCount: validation.issues.length,
      invalidRowCount: validation.invalidRowIndexes.length,
      remediationAttempts,
      exhausted: !validation.valid && remediationAttempts >= maxRemediationAttempts,
      blockedByDeterministicRule,
    }),
    statistics: Object.freeze({
      inputRowCount: outputPlan.inputRowCount,
      requestedRowCount: outputPlan.requestedRowCount,
      generatedRowCount: generatedRows.length,
      boundedCandidateTemplateCount: candidateTemplates.length,
      syntheticTemplateUseCount: usingStructuredSource
        ? 0
        : schedule.filter((entry) => entry.reference === null || !templates.has(entry.reference.sourceRowIndex)).length,
      structuredSourceRowCount: usingStructuredSource ? sourceEntries.length : 0,
      mapping: mappingStatistics,
      dateShift: dateShiftContext.statistics(),
      distributionSampling: distributionSampler.statistics(),
      relationships: relationshipRegistry.statistics(),
      businessRelationships: businessRelationshipPreserver.statistics(),
      rankAlignment,
      businessFidelity: fidelity,
      businessFidelitySettings: fidelitySettings,
      jointSampling: Object.freeze({
        activeGroupCount: jointSamplingColumnIndexes.size > 0 ? activeJointSamplingGroups.length : 0,
        activeColumnCount: jointSamplingColumnIndexes.size,
      }),
    }),
  });
}
