import { createContractWarning, createParseIssue, relationshipIsActive } from '../core/contracts.js';
import { parseTemporalValue } from '../detection/date-time.js';
import { valueShape } from '../detection/pattern-utils.js';
import { parseNumericToken } from '../profile/value-normalization.js';
import { evaluateDateOrder } from '../relationships/date-relationships.js';
import { resolveDateOrientation } from '../generation/date-shift-context.js';
import { isInternalTemplateMarker } from '../generation/template-descriptors.js';
import { isRecognisedNumericMissingSentinel } from '../generation/numeric-missing-sentinel.js';
import { sourceReuseAllowance } from './source-reuse-threshold.js';
import { normalizeHeader } from '../detection/header-normalization.js';
import { parseBusinessNumber } from '../business/relationship-profiler.js';

const BUSINESS_RELATIONSHIP_KINDS = new Set([
  'NUMERIC_EQUAL', 'NUMERIC_DIFFERENCE', 'NUMERIC_RATIO',
  'BOOLEAN_FROM_POSITIVE', 'POSITIVE_FROM_BOOLEAN',
]);

function businessBoolean(value) {
  const token = String(value ?? '').trim().toLocaleLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'available', 'in stock'].includes(token)) return true;
  if (['false', 'no', 'n', '0', 'off', 'unavailable', 'out of stock'].includes(token)) return false;
  return null;
}

function closeBusinessNumber(left, right) {
  return Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
}

function businessRelationshipIsValid(row, headers, rule) {
  const details = { ...rule, ...rule.options };
  const sourceIndex = headers.indexOf(details.sourceColumnName ?? rule.columnNames?.[0]);
  const targetIndex = headers.indexOf(details.targetColumnName ?? rule.columnNames?.[1]);
  if (sourceIndex < 0 || targetIndex < 0) return false;
  if (rule.kind === 'POSITIVE_FROM_BOOLEAN') {
    const source = businessBoolean(row[sourceIndex]);
    const target = parseBusinessNumber(row[targetIndex]);
    return source !== null && target !== null && (source ? target > 0 : target <= 0);
  }
  const source = parseBusinessNumber(row[sourceIndex]);
  if (source === null) return false;
  if (rule.kind === 'BOOLEAN_FROM_POSITIVE') {
    const target = businessBoolean(row[targetIndex]);
    return target !== null && target === (source > 0);
  }
  const target = parseBusinessNumber(row[targetIndex]);
  if (target === null) return false;
  if (rule.kind === 'NUMERIC_EQUAL') return closeBusinessNumber(target, source);
  if (rule.kind === 'NUMERIC_DIFFERENCE') return closeBusinessNumber(target, source + Number(details.value));
  if (rule.kind === 'NUMERIC_RATIO') return closeBusinessNumber(target, source * Number(details.value));
  return true;
}

function valueMatchesType(value, detectedType) {
  const text = String(value ?? '').trim();
  if (text === '') return true;
  if (['INTEGER', 'NUMERIC_ID'].includes(detectedType)) return /^[-+]?\d+$/.test(text);
  if (['DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE'].includes(detectedType)) return parseNumericToken(text) !== null;
  if (detectedType === 'BOOLEAN') return /^(?:true|false|yes|no|y|n|0|1|on|off)$/i.test(text);
  if (detectedType === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  if (['DATE', 'TIME', 'DATETIME'].includes(detectedType)) return parseTemporalValue(text)?.kind === detectedType;
  return true;
}

function valueMatchesGeneralisation(value, policy) {
  const text = String(value ?? '').trim();
  if (text === '') return true;
  const strategy = policy.actionParams?.strategy ?? 'AUTO';
  if (strategy === 'DATE_PRECISION' || (strategy === 'AUTO' && ['DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(policy.detectedType))) {
    const expectedType = policy.detectedType === 'AMBIGUOUS_DATE' ? 'DATE' : policy.detectedType;
    return valueMatchesType(text, expectedType);
  }
  if (strategy === 'POSTCODE_PREFIX') return /^[A-Za-z0-9]{1,3}\*+$/.test(text);
  const categoryGroup = /^(?:Category|.+) Group \d+$/u;
  if (strategy === 'CATEGORY_GROUP') return categoryGroup.test(text);
  if (strategy === 'TEXT_LENGTH_BAND') return /^Text length \d+-\d+$/.test(text);
  if (strategy === 'AGE_BAND' || strategy === 'NUMERIC_BAND') {
    return /^(?:[^\d+-])?[+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?%?$/.test(text);
  }
  return categoryGroup.test(text)
    || /^Text length \d+-\d+$/.test(text)
    || /^[A-Za-z0-9]{1,3}\*+$/.test(text)
    || /^(?:[^\d+-])?[+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?%?$/.test(text)
    || valueMatchesType(text, policy.detectedType === 'AMBIGUOUS_DATE' ? 'DATE' : policy.detectedType);
}

const DIRECT_IDENTIFIER_TYPES = new Set([
  'EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE',
  'AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE',
]);
const SOURCE_REUSE_REPLACEMENT_ACTIONS = new Set(['REPLACE', 'PATTERN_REPLACE']);
const BROAD_LOCATION_VOCABULARY_HEADER = /(^|_)(state|province|territory|country|suburb|city|town|locality|postcode|post_code|postal_code|zip|zip_code)(_|$)/;
const HIGH_DUPLICATE_RATE_THRESHOLD = 0.8;

function hasProtectedIdentifierHeader(columnName) {
  return /(^|[^a-z])(email|phone|mobile|name|address|member|staff|employee|assignee|operator|worker|technician|signature)([^a-z]|$)/i.test(columnName);
}

function allowsBroadLocationVocabularyReuse(policy) {
  return policy?.selectedAction === 'REPLACE'
    && BROAD_LOCATION_VOCABULARY_HEADER.test(normalizeHeader(policy.columnName));
}

export function validateOutput({
  outputPlan,
  headers,
  rows,
  policies = [],
  profiles = [],
  detections = [],
  relationshipRules = [],
  uniqueColumns = [],
  expectedPatternShapesByRow = [],
}) {
  const issues = [];
  const warnings = [];
  const invalidRowIndexes = new Set();
  if (rows.length !== outputPlan.requestedRowCount) {
    issues.push(createParseIssue({
      code: 'OUTPUT_ROW_COUNT_MISMATCH',
      type: 'VALIDATION',
      message: 'Generated row count did not equal requestedRowCount.',
      severity: 'ERROR',
      details: { requestedRowCount: outputPlan.requestedRowCount, actualRowCount: rows.length },
    }));
  }

  const policyByName = new Map(policies.map((policy, index) => {
    const profile = profiles[index];
    const sourceValues = new Set([
      ...(profile?.sampleValues ?? []),
      ...(profile?.topValues ?? []).map((entry) => entry.value),
    ].map((value) => String(value)));
    return [policy.columnName, { policy, profile, detection: detections[index], sourceValues }];
  }));
  const sourceReuseByColumn = new Map();
  const orientationForColumn = (columnName) => {
    const entry = policyByName.get(columnName);
    return resolveDateOrientation({ actionParams: entry?.policy?.actionParams, detection: entry?.detection });
  };
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== headers.length) {
      issues.push(createParseIssue({
        code: 'OUTPUT_SCHEMA_MISMATCH', type: 'VALIDATION', message: 'Generated row did not match the output schema.',
        severity: 'ERROR', rowIndex, details: { expectedColumns: headers.length, actualColumns: row?.length ?? null },
      }));
      invalidRowIndexes.add(rowIndex);
      return;
    }
    headers.forEach((header, columnIndex) => {
      const policyEntry = policyByName.get(header);
      const policy = policyEntry?.policy;
      const outputText = String(row[columnIndex] ?? '');
      if (isInternalTemplateMarker(outputText)) {
        issues.push(createParseIssue({
          code: 'INTERNAL_TEMPLATE_LEAK', type: 'VALIDATION', message: 'An internal generation template reached final output.',
          severity: 'ERROR', rowIndex, columnIndex, details: { columnName: header },
        }));
        invalidRowIndexes.add(rowIndex);
        return;
      }
      const protectedIdentifier = policy
        && (DIRECT_IDENTIFIER_TYPES.has(policy.detectedType) || hasProtectedIdentifierHeader(policy.columnName));
      const replacementAction = policy && SOURCE_REUSE_REPLACEMENT_ACTIONS.has(policy.selectedAction);
      if (policy?.selectedAction !== 'KEEP'
        && (protectedIdentifier || replacementAction)) {
        const reuseEntry = sourceReuseByColumn.get(header) ?? {
          columnIndex,
          nonEmptyCount: 0,
          blankOutputRowsExcluded: 0,
          reusedRowIndexes: [],
          reusedValues: new Set(),
          outputValues: new Set(),
          sourceValues: policyEntry.sourceValues,
          protectedIdentifier,
          policy,
          profile: policyEntry.profile,
        };
        if (outputText.trim() === '') {
          reuseEntry.blankOutputRowsExcluded += 1;
        } else {
          reuseEntry.nonEmptyCount += 1;
          reuseEntry.outputValues.add(outputText);
          if (policyEntry.sourceValues.has(outputText)) {
            reuseEntry.reusedRowIndexes.push(rowIndex);
            reuseEntry.reusedValues.add(outputText);
          }
        }
        sourceReuseByColumn.set(header, reuseEntry);
      }
      // KEEP deliberately preserves the source representation. The detector is
      // advisory and may have inferred a type from a header or bounded sample,
      // so it must not reject the exact input format the user chose to retain.
      const typeMatches = policy?.selectedAction === 'GENERALISE'
        ? valueMatchesGeneralisation(row[columnIndex], policy)
        : isRecognisedNumericMissingSentinel({
            value: row[columnIndex],
            policy,
            profile: policyEntry?.profile,
          }) || valueMatchesType(row[columnIndex], policy?.detectedType);
      if (policy && policy.selectedAction !== 'KEEP' && !typeMatches) {
        issues.push(createParseIssue({
          code: 'OUTPUT_TYPE_MISMATCH', type: 'VALIDATION', message: 'Generated value did not match the detected column type.',
          severity: 'ERROR', rowIndex, columnIndex, details: { columnName: header, detectedType: policy.detectedType },
        }));
        invalidRowIndexes.add(rowIndex);
      }
      const pattern = policyByName.get(header)?.detection?.details?.pattern;
      const rowSpecificShape = expectedPatternShapesByRow[rowIndex]?.[header];
      const expectedShapes = rowSpecificShape
        ? new Set([rowSpecificShape])
        : new Set((pattern?.commonShapes ?? []).map((entry) => entry.value).filter(Boolean));
      if (!rowSpecificShape && expectedShapes.size === 0 && pattern?.dominantShape?.value) expectedShapes.add(pattern.dominantShape.value);
      const actualShape = valueShape(outputText);
      if (policy?.selectedAction === 'PATTERN_REPLACE'
        && outputText.trim() !== ''
        && expectedShapes.size > 0
        && !expectedShapes.has(actualShape)) {
        issues.push(createParseIssue({
          code: 'OUTPUT_PATTERN_MISMATCH', type: 'VALIDATION', message: 'Generated value did not preserve the confirmed structural pattern.',
          severity: 'ERROR', rowIndex, columnIndex, details: { columnName: header, expectedShapes: Object.freeze([...expectedShapes]) },
        }));
        invalidRowIndexes.add(rowIndex);
      }
    });
  });

  for (const [columnName, reuseEntry] of sourceReuseByColumn) {
    const reusedDistinctCount = reuseEntry.reusedValues.size;
    if (reusedDistinctCount === 0 || reuseEntry.nonEmptyCount === 0) continue;
    if (allowsBroadLocationVocabularyReuse(reuseEntry.policy)) {
      warnings.push(createContractWarning(
        'OUTPUT_BOUNDED_VOCABULARY_REUSE',
        'A broad location field reused a valid public label. This is expected for limited geographic vocabularies and did not block generation.',
        {
          columnName,
          reusedDistinctCount,
          reusedRowCount: reuseEntry.reusedRowIndexes.length,
          nonEmptyCount: reuseEntry.nonEmptyCount,
          blankOutputRowsExcluded: reuseEntry.blankOutputRowsExcluded,
          outputDistinctCount: reuseEntry.outputValues.size,
          riskLevel: reuseEntry.policy.riskLevel ?? 'UNKNOWN',
          attributeRole: reuseEntry.policy.attributeRole ?? 'ORDINARY',
          protectedIdentifier: reuseEntry.protectedIdentifier,
        },
      ));
      continue;
    }
    const chance = sourceReuseAllowance({
      policy: reuseEntry.policy,
      sourceValues: reuseEntry.sourceValues,
      outputDistinctCount: reuseEntry.outputValues.size,
    });
    if (reusedDistinctCount <= chance.allowance) {
      warnings.push(createContractWarning(
        'OUTPUT_SOURCE_VALUE_CHANCE_COLLISION',
        'A pattern replacement reproduced a bounded source value, but the collision is plausible within the finite detected format space.',
        {
          columnName,
          reusedDistinctCount,
          reusedRowCount: reuseEntry.reusedRowIndexes.length,
          nonEmptyCount: reuseEntry.nonEmptyCount,
          blankOutputRowsExcluded: reuseEntry.blankOutputRowsExcluded,
          outputDistinctCount: reuseEntry.outputValues.size,
          estimatedSpace: chance.estimatedSpace,
          expectedCollisions: chance.expectedCollisions,
          allowance: chance.allowance,
          riskLevel: reuseEntry.policy.riskLevel ?? 'UNKNOWN',
          attributeRole: reuseEntry.policy.attributeRole ?? 'ORDINARY',
          protectedIdentifier: reuseEntry.protectedIdentifier,
        },
      ));
      continue;
    }
    warnings.push(createContractWarning(
      'OUTPUT_SOURCE_VALUE_REUSE',
      'A replacement action reused bounded source evidence.',
      {
        columnName,
        reusedDistinctCount,
        reusedRowCount: reuseEntry.reusedRowIndexes.length,
        nonEmptyCount: reuseEntry.nonEmptyCount,
        blankOutputRowsExcluded: reuseEntry.blankOutputRowsExcluded,
        outputDistinctCount: reuseEntry.outputValues.size,
        estimatedSpace: chance.estimatedSpace,
        expectedCollisions: chance.expectedCollisions,
        allowance: chance.allowance,
        basis: chance.basis,
        riskLevel: reuseEntry.policy.riskLevel ?? 'UNKNOWN',
        attributeRole: reuseEntry.policy.attributeRole ?? 'ORDINARY',
        protectedIdentifier: reuseEntry.protectedIdentifier,
      },
    ));
  }

  const identifierTypes = new Set([
    'NUMERIC_ID', 'ALPHANUMERIC_CODE', 'EMAIL', 'PHONE_LIKE',
    'AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE',
  ]);
  const inferredUnique = policies
    .map((policy, index) => ({ name: policy.columnName, profile: profiles[index] }))
    .filter(({ name, profile }, index) => (
      headers.includes(name)
      && identifierTypes.has(policies[index].detectedType)
      && !BROAD_LOCATION_VOCABULARY_HEADER.test(normalizeHeader(name))
      && (profile?.uniqueRatio ?? 0) >= 0.98
    ))
    .map(({ name }) => name);
  const strictUniqueColumns = new Set(uniqueColumns);
  for (const columnName of strictUniqueColumns) {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex < 0) continue;
    const seen = new Set();
    let nonEmptyCount = 0;
    let duplicateRowCount = 0;
    rows.forEach((row) => {
      if (row[columnIndex] === null || row[columnIndex] === undefined || String(row[columnIndex]).trim() === '') return;
      nonEmptyCount += 1;
      const key = `${typeof row[columnIndex]}:${String(row[columnIndex])}`;
      if (seen.has(key)) duplicateRowCount += 1;
      else seen.add(key);
    });
    if (duplicateRowCount > 0) warnings.push(createContractWarning(
      'OUTPUT_UNIQUENESS_VIOLATION',
      'A column configured as unique contains repeated values.',
      { columnName, nonEmptyCount, distinctCount: seen.size, duplicateRowCount },
    ));
  }
  for (const columnName of inferredUnique.filter((name) => !strictUniqueColumns.has(name))) {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex < 0) continue;
    const seen = new Set();
    let nonEmptyCount = 0;
    let duplicateRowCount = 0;
    rows.forEach((row) => {
      const value = row[columnIndex];
      if (value === null || value === undefined || String(value).trim() === '') return;
      nonEmptyCount += 1;
      const key = `${typeof value}:${String(value)}`;
      if (seen.has(key)) duplicateRowCount += 1;
      else seen.add(key);
    });
    if (duplicateRowCount > 0) warnings.push(createContractWarning(
      'OUTPUT_INFERRED_UNIQUENESS_RELAXED',
      'The source looked unique, but generated duplicates were allowed because uniqueness was inferred rather than explicitly required.',
      { columnName, nonEmptyCount, distinctCount: seen.size, duplicateRowCount },
    ));
  }

  const uniquenessReviewedColumns = new Set([...strictUniqueColumns, ...inferredUnique]);
  headers.forEach((columnName, columnIndex) => {
    if (uniquenessReviewedColumns.has(columnName)) return;
    const seen = new Set();
    let nonEmptyCount = 0;
    let duplicateRowCount = 0;
    rows.forEach((row) => {
      const value = row?.[columnIndex];
      if (value === null || value === undefined || String(value).trim() === '') return;
      nonEmptyCount += 1;
      const key = `${typeof value}:${String(value)}`;
      if (seen.has(key)) duplicateRowCount += 1;
      else seen.add(key);
    });
    const duplicateRate = nonEmptyCount > 0 ? duplicateRowCount / nonEmptyCount : 0;
    if (duplicateRate >= HIGH_DUPLICATE_RATE_THRESHOLD) warnings.push(createContractWarning(
      'OUTPUT_HIGH_DUPLICATE_RATE',
      'Most non-empty rows repeat a value already present in this column.',
      {
        columnName,
        nonEmptyCount,
        distinctCount: seen.size,
        duplicateRowCount,
        duplicateRate,
      },
    ));
  });

  for (const rule of relationshipRules.filter(relationshipIsActive)) {
    if (BUSINESS_RELATIONSHIP_KINDS.has(rule.kind)) {
      rows.forEach((row, rowIndex) => {
        if (!businessRelationshipIsValid(row, headers, rule)) {
          issues.push(createParseIssue({
            code: 'BUSINESS_RELATIONSHIP_VIOLATION',
            type: 'VALIDATION',
            message: 'Generated values violated a confirmed evidence-backed relationship.',
            severity: 'ERROR',
            rowIndex,
            details: { relationshipId: rule.id, relationshipKind: rule.kind },
          }));
          invalidRowIndexes.add(rowIndex);
        }
      });
    }
    if (rule.kind === 'SAME_ID') {
      const indexes = rule.columnNames.map((name) => headers.indexOf(name));
      if (indexes.every((index) => index >= 0)) {
        rows.forEach((row, rowIndex) => {
          if (!indexes.every((index) => row[index] === row[indexes[0]])) {
            issues.push(createParseIssue({
              code: 'SAME_ID_RELATIONSHIP_VIOLATION', type: 'VALIDATION', message: 'Columns in a confirmed same-ID relationship were not mapped consistently.',
              severity: 'ERROR', rowIndex, details: { relationshipId: rule.id },
            }));
            invalidRowIndexes.add(rowIndex);
          }
        });
      }
    }
    if (rule.kind === 'DATE_ORDER') {
      rows.forEach((row, rowIndex) => {
        if (evaluateDateOrder({ row, headers, rule, orientationForColumn }).status === 'VIOLATION') {
          issues.push(createParseIssue({
            code: 'DATE_RELATIONSHIP_VIOLATION', type: 'VALIDATION', message: 'Generated dates violated a confirmed order.',
            severity: 'ERROR', rowIndex, details: { relationshipId: rule.id },
          }));
          invalidRowIndexes.add(rowIndex);
        }
      });
    }
    if (rule.kind === 'DATE_TIME_SHIFT_GROUP' && rule.options?.preserveOrder !== false) {
      for (let columnIndex = 0; columnIndex < rule.columnNames.length - 1; columnIndex += 1) {
        const pairRule = { ...rule, columnNames: [rule.columnNames[columnIndex], rule.columnNames[columnIndex + 1]] };
        rows.forEach((row, rowIndex) => {
          if (evaluateDateOrder({ row, headers, rule: pairRule, orientationForColumn }).status === 'VIOLATION') {
            issues.push(createParseIssue({
              code: 'SHIFT_GROUP_ORDER_VIOLATION', type: 'VALIDATION', message: 'A confirmed date shift group violated its selected column order.',
              severity: 'ERROR', rowIndex, details: { relationshipId: rule.id },
            }));
            invalidRowIndexes.add(rowIndex);
          }
        });
      }
    }
    if (['CODE_DESCRIPTION', 'CATEGORY_CODE_NAME'].includes(rule.kind)) {
      const codeIndex = headers.indexOf(rule.columnNames[0]);
      const descriptionIndex = headers.indexOf(rule.columnNames[1]);
      if (codeIndex < 0 || descriptionIndex < 0) continue;
      const descriptions = new Map();
      rows.forEach((row, rowIndex) => {
        const code = String(row[codeIndex]);
        const description = String(row[descriptionIndex]);
        if (descriptions.has(code) && descriptions.get(code) !== description) {
          issues.push(createParseIssue({
            code: 'CODE_DESCRIPTION_VIOLATION', type: 'VALIDATION', message: 'One generated code mapped to multiple descriptions.',
            severity: 'ERROR', rowIndex, details: { relationshipId: rule.id },
          }));
          invalidRowIndexes.add(rowIndex);
        } else descriptions.set(code, description);
      });
    }
  }

  if (policies.some((policy) => policy.selectedAction === 'TEXT_SANITISE')) {
    warnings.push(createContractWarning(
      'TEXT_SANITISATION_REQUIRES_REVIEW',
      'Text sanitisation is pattern-based and cannot guarantee that every sensitive phrase was removed.',
      {},
    ));
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    warnings: Object.freeze(warnings),
    invalidRowIndexes: Object.freeze([...invalidRowIndexes].sort((left, right) => left - right)),
    statistics: Object.freeze({ rowCount: rows.length, columnCount: headers.length, issueCount: issues.length }),
  });
}
