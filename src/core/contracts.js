import {
  ACTION_VALUES,
  ATTRIBUTE_ROLE_VALUES,
  CONFIDENCE_LEVELS,
  DEFAULT_MODE,
  DEFAULT_OUTPUT_ROW_COUNT,
  DEFAULT_OUTPUT_STRATEGY,
  INPUT_SOURCE_KINDS,
  INPUT_SOURCE_KIND_VALUES,
  ISSUE_SEVERITIES,
  MEASUREMENT_STATUSES,
  MODE_VALUES,
  OUTPUT_ROW_WARNING_THRESHOLD,
  OUTPUT_STRATEGY_VALUES,
  RISK_LEVELS,
} from './constants.js';

export const RELATIONSHIP_STATUSES = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  CONFIRMED: 'CONFIRMED',
  INFORMATIONAL: 'INFORMATIONAL',
  UNSUPPORTED: 'UNSUPPORTED',
});
export const RELATIONSHIP_STATUS_VALUES = Object.freeze(Object.values(RELATIONSHIP_STATUSES));

export function relationshipIsConfirmed(rule) {
  return rule?.status === RELATIONSHIP_STATUSES.CONFIRMED
    || (rule?.status === undefined && rule?.enabled === true);
}

export function relationshipIsActive(rule) {
  return Boolean(rule?.enabled) && relationshipIsConfirmed(rule);
}

/**
 * @typedef {Object} ContractWarning
 * @property {string} code
 * @property {string} message
 * @property {Readonly<Record<string, unknown>>} details
 */

/**
 * A user-provided source. Deliberately excludes a full local path to avoid
 * retaining unnecessary workstation information.
 *
 * @typedef {Object} InputSource
 * @property {string} id
 * @property {'FILE'|'PASTE'|'TEXT'} kind
 * @property {string|null} name
 * @property {number|null} sizeBytes
 * @property {Readonly<Record<string, unknown>>} metadata
 */

/**
 * @typedef {Object} ParseIssue
 * @property {string} code
 * @property {string} type
 * @property {string} message
 * @property {'INFO'|'WARNING'|'ERROR'} severity
 * @property {number|null} rowIndex Zero-based row index when known.
 * @property {number|null} columnIndex Zero-based column index when known.
 * @property {number|null} position Character or byte position when available.
 * @property {Readonly<Record<string, unknown>>} details
 */

/**
 * Stream-oriented parsed input contract. Implementations may be single-use.
 * `inputRowCount` is input metadata only and must never control output size.
 *
 * @typedef {Object} ParsedRowStream
 * @property {readonly string[]} headers
 * @property {number|null} inputRowCount
 * @property {() => AsyncIterable<readonly string[]>} rows
 * @property {readonly ParseIssue[]} issues
 */

/**
 * @typedef {Object} ColumnProfile
 * @property {number} columnIndex
 * @property {string} columnName
 * @property {number} observedRowCount
 * @property {number} nonEmptyCount
 * @property {number} nullCount
 * @property {number} emptyCount
 * @property {number} nonEmptyRatio
 * @property {number} emptyRatio
 * @property {number|null} uniqueCount
 * @property {number|null} uniqueRatio
 * @property {'NOT_COMPUTED'|'EXACT'|'SAMPLED'|'LOWER_BOUND'|'ESTIMATED'} uniqueCountStatus
 * @property {readonly unknown[]} sampleValues
 * @property {Readonly<Record<string, unknown>>} lengthStats
 * @property {readonly Readonly<Record<string, unknown>>[]} topValues
 * @property {Readonly<Record<string, unknown>>|null} numericStats
 * @property {readonly Readonly<Record<string, unknown>>[]} decimalPlaces
 * @property {Readonly<Record<string, unknown>>} casePatterns
 * @property {Readonly<Record<string, unknown>>} measurementStatus
 * @property {readonly ContractWarning[]} warnings
 * @property {Readonly<Record<string, unknown>>} limits
 * @property {Readonly<Record<string, unknown>>} measurements
 */

/**
 * @typedef {Object} DetectionEvidence
 * @property {string} detector
 * @property {string} type
 * @property {string} detectedType
 * @property {'LOW'|'MEDIUM'|'HIGH'} confidence
 * @property {readonly string[]} evidence
 * @property {readonly ContractWarning[]} warnings
 * @property {boolean} reviewRequired
 * @property {number} sampleSize
 * @property {Readonly<Record<string, unknown>>} details
 */

/**
 * @typedef {Object} RiskAssessment
 * @property {'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN'} level
 * @property {readonly string[]} reasons
 * @property {readonly string[]} evidence
 * @property {readonly string[]} matchedRuleIds
 * @property {readonly ContractWarning[]} warnings
 * @property {boolean} reviewRequired
 */

/**
 * @typedef {Object} ColumnPolicy
 * @property {string} columnName
 * @property {string} detectedType
 * @property {RiskAssessment} riskAssessment
 * @property {'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN'} riskLevel
 * @property {string|null} recommendedAction
 * @property {Readonly<Record<string, unknown>>} recommendedActionParams
 * @property {string|null} selectedAction
 * @property {Readonly<Record<string, unknown>>} actionParams
 * @property {string|null} reason
 * @property {readonly string[]} evidence
 * @property {readonly ContractWarning[]} warnings
 * @property {boolean} userOverride
 * @property {boolean} reviewRequired
 */

/**
 * @typedef {Object} RelationshipRule
 * @property {string} id
 * @property {string} kind
 * @property {readonly string[]} columnNames
 * @property {'LOW'|'MEDIUM'|'HIGH'} confidence
 * @property {number|null} confidenceScore
 * @property {number|null} support
 * @property {'CANDIDATE'|'CONFIRMED'|'INFORMATIONAL'|'UNSUPPORTED'} status
 * @property {boolean} confirmed
 * @property {boolean} enabled
 * @property {readonly string[]} evidence
 * @property {'DETECTED'|'USER'} source
 * @property {string|null} mappingScope
 * @property {boolean} reviewRequired
 * @property {Readonly<Record<string, unknown>>} options
 * @property {readonly ContractWarning[]} warnings
 */

/**
 * @typedef {Object} CoverageScenario
 * @property {string} id
 * @property {string} kind
 * @property {readonly string[]} columnNames
 * @property {number} priority
 * @property {number} weight
 * @property {string} description
 * @property {boolean} sensitive
 * @property {readonly string[]} evidence
 * @property {Readonly<Record<string, unknown>>} details
 */

/**
 * Reference to a bounded candidate row. Raw row values are intentionally not
 * part of this general contract.
 *
 * @typedef {Object} TemplateRowReference
 * @property {number} sourceRowIndex
 * @property {readonly string[]} coverageScenarioIds
 * @property {number} score
 * @property {number} plannedUseCount
 */

/**
 * The output plan is independent from input size. A 100,000-row input may have
 * a requestedRowCount of 50, 200, 1,000, or another positive integer.
 *
 * @typedef {Object} OutputPlan
 * @property {number|null} inputRowCount
 * @property {number} requestedRowCount
 * @property {number} recommendedMinimumRows
 * @property {'BALANCED'|'REPRESENTATIVE'|'COVERAGE_FIRST'} strategy
 * @property {readonly CoverageScenario[]} requiredScenarios
 * @property {readonly TemplateRowReference[]} selectedTemplateRows
 * @property {readonly string[]} coveredScenarioIds
 * @property {readonly string[]} missingScenarioIds
 * @property {Readonly<Record<string, unknown>>} coverageSummary
 * @property {readonly ContractWarning[]} warnings
 */

/**
 * @typedef {Object} TransformationContext
 * @property {'ID_ONLY'|'SAFE_TEST_DATA'|'FULL_SYNTHETIC'} mode
 * @property {OutputPlan} outputPlan
 * @property {readonly ColumnPolicy[]} policies
 * @property {readonly RelationshipRule[]} relationshipRules
 * @property {Readonly<Record<string, unknown>>} options
 */

/**
 * @typedef {Object} GenerationResult
 * @property {OutputPlan} outputPlan
 * @property {readonly string[]} headers
 * @property {readonly (readonly unknown[])[]} rows
 * @property {readonly ParseIssue[]} issues
 * @property {readonly ContractWarning[]} warnings
 * @property {readonly Readonly<Record<string, number|null>>[]} sourcePreviewReferences
 * @property {Readonly<Record<string, unknown>>} validation
 * @property {Readonly<Record<string, unknown>>} statistics
 */

/** @param {unknown} value @param {string} name */
function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

/** @param {unknown} value @param {string} name */
function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array.`);
  }
  return Object.freeze([...value]);
}

/** @param {unknown} value @param {string} name */
function requireRecord(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return Object.freeze({ ...value });
}

/** @param {unknown} value @param {readonly unknown[]} allowed @param {string} name */
function requireOneOf(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new RangeError(`${name} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

/** @param {unknown} value @param {string} name */
function requireNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
  return value;
}

/**
 * Validates a user-selected output row count.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function validateRequestedRowCount(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('requestedRowCount must be a positive integer.');
  }
  return value;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {ContractWarning}
 */
export function createContractWarning(code, message, details = {}) {
  return Object.freeze({
    code: requireNonEmptyString(code, 'code'),
    message: requireNonEmptyString(message, 'message'),
    details: requireRecord(details, 'details'),
  });
}

/**
 * @param {Object} values
 * @param {string} values.id
 * @param {'FILE'|'PASTE'|'TEXT'} values.kind
 * @param {string|null} [values.name]
 * @param {number|null} [values.sizeBytes]
 * @param {Record<string, unknown>} [values.metadata]
 * @returns {InputSource}
 */
export function createInputSource({
  id,
  kind,
  name = null,
  sizeBytes = null,
  metadata = {},
}) {
  if (name !== null && typeof name !== 'string') {
    throw new TypeError('name must be a string or null.');
  }
  if (sizeBytes !== null) {
    requireNonNegativeInteger(sizeBytes, 'sizeBytes');
  }

  return Object.freeze({
    id: requireNonEmptyString(id, 'id'),
    kind: requireOneOf(kind, INPUT_SOURCE_KIND_VALUES, 'kind'),
    name,
    sizeBytes,
    metadata: requireRecord(metadata, 'metadata'),
  });
}

/**
 * Creates a stream descriptor without reading or retaining the input rows.
 * The rows factory may return a fresh or single-use async iterable depending
 * on the parser implementation added in a later stage.
 *
 * @param {Object} values
 * @param {string[]} values.headers
 * @param {number|null} [values.inputRowCount]
 * @param {() => AsyncIterable<readonly string[]>} values.rows
 * @param {ParseIssue[]} [values.issues]
 * @returns {ParsedRowStream}
 */
export function createParsedRowStream({
  headers,
  inputRowCount = null,
  rows,
  issues = [],
}) {
  if (inputRowCount !== null) {
    requireNonNegativeInteger(inputRowCount, 'inputRowCount');
  }
  if (typeof rows !== 'function') {
    throw new TypeError('rows must be an async iterable factory function.');
  }

  return Object.freeze({
    headers: requireArray(headers, 'headers'),
    inputRowCount,
    rows,
    issues: requireArray(issues, 'issues'),
  });
}

/**
 * @param {Object} values
 * @param {string} values.code
 * @param {string} [values.type]
 * @param {string} values.message
 * @param {'INFO'|'WARNING'|'ERROR'} [values.severity]
 * @param {number|null} [values.rowIndex]
 * @param {number|null} [values.columnIndex]
 * @param {number|null} [values.position]
 * @param {Record<string, unknown>} [values.details]
 * @returns {ParseIssue}
 */
export function createParseIssue({
  code,
  type = 'PARSE',
  message,
  severity = ISSUE_SEVERITIES.ERROR,
  rowIndex = null,
  columnIndex = null,
  position = null,
  details = {},
}) {
  if (rowIndex !== null) requireNonNegativeInteger(rowIndex, 'rowIndex');
  if (columnIndex !== null) {
    requireNonNegativeInteger(columnIndex, 'columnIndex');
  }
  if (position !== null) requireNonNegativeInteger(position, 'position');

  return Object.freeze({
    code: requireNonEmptyString(code, 'code'),
    type: requireNonEmptyString(type, 'type'),
    message: requireNonEmptyString(message, 'message'),
    severity: requireOneOf(
      severity,
      Object.values(ISSUE_SEVERITIES),
      'severity',
    ),
    rowIndex,
    columnIndex,
    position,
    details: requireRecord(details, 'details'),
  });
}

/**
 * @param {Object} values
 * @param {number} values.columnIndex
 * @param {string} values.columnName
 * @param {number} [values.observedRowCount]
 * @param {number} [values.nonEmptyCount]
 * @param {number} [values.nullCount]
 * @param {number} [values.emptyCount]
 * @param {number} [values.nonEmptyRatio]
 * @param {number} [values.emptyRatio]
 * @param {number|null} [values.uniqueCount]
 * @param {number|null} [values.uniqueRatio]
 * @param {string} [values.uniqueCountStatus]
 * @param {unknown[]} [values.sampleValues]
 * @param {Record<string, unknown>} [values.lengthStats]
 * @param {Record<string, unknown>[]} [values.topValues]
 * @param {Record<string, unknown>|null} [values.numericStats]
 * @param {Record<string, unknown>[]} [values.decimalPlaces]
 * @param {Record<string, unknown>} [values.casePatterns]
 * @param {Record<string, unknown>} [values.measurementStatus]
 * @param {ContractWarning[]} [values.warnings]
 * @param {Record<string, unknown>} [values.limits]
 * @param {Record<string, unknown>} [values.measurements]
 * @returns {ColumnProfile}
 */
export function createColumnProfile({
  columnIndex,
  columnName,
  observedRowCount = 0,
  nonEmptyCount = 0,
  nullCount = 0,
  emptyCount = nullCount,
  nonEmptyRatio = observedRowCount === 0 ? 0 : nonEmptyCount / observedRowCount,
  emptyRatio = observedRowCount === 0 ? 0 : emptyCount / observedRowCount,
  uniqueCount = null,
  uniqueRatio = uniqueCount === null || nonEmptyCount === 0 ? null : uniqueCount / nonEmptyCount,
  uniqueCountStatus = MEASUREMENT_STATUSES.NOT_COMPUTED,
  sampleValues = [],
  lengthStats = {},
  topValues = [],
  numericStats = null,
  decimalPlaces = [],
  casePatterns = {},
  measurementStatus = {},
  warnings = [],
  limits = {},
  measurements = {},
}) {
  requireNonNegativeInteger(columnIndex, 'columnIndex');
  requireNonNegativeInteger(observedRowCount, 'observedRowCount');
  requireNonNegativeInteger(nonEmptyCount, 'nonEmptyCount');
  requireNonNegativeInteger(nullCount, 'nullCount');
  requireNonNegativeInteger(emptyCount, 'emptyCount');
  if (uniqueCount !== null) requireNonNegativeInteger(uniqueCount, 'uniqueCount');

  return Object.freeze({
    columnIndex,
    columnName: requireNonEmptyString(columnName, 'columnName'),
    observedRowCount,
    nonEmptyCount,
    nullCount,
    emptyCount,
    nonEmptyRatio,
    emptyRatio,
    uniqueCount,
    uniqueRatio,
    uniqueCountStatus: requireOneOf(
      uniqueCountStatus,
      Object.values(MEASUREMENT_STATUSES),
      'uniqueCountStatus',
    ),
    sampleValues: requireArray(sampleValues, 'sampleValues'),
    lengthStats: requireRecord(lengthStats, 'lengthStats'),
    topValues: requireArray(topValues, 'topValues'),
    numericStats: numericStats === null ? null : requireRecord(numericStats, 'numericStats'),
    decimalPlaces: requireArray(decimalPlaces, 'decimalPlaces'),
    casePatterns: requireRecord(casePatterns, 'casePatterns'),
    measurementStatus: requireRecord(measurementStatus, 'measurementStatus'),
    warnings: requireArray(warnings, 'warnings'),
    limits: requireRecord(limits, 'limits'),
    measurements: requireRecord(measurements, 'measurements'),
  });
}

/** @returns {DetectionEvidence} */
export function createDetectionEvidence({
  detector,
  detectedType,
  confidence = CONFIDENCE_LEVELS.LOW,
  evidence = [],
  warnings = [],
  reviewRequired = true,
  sampleSize = 0,
  details = {},
}) {
  requireNonNegativeInteger(sampleSize, 'sampleSize');
  const type = requireNonEmptyString(detectedType, 'detectedType');
  return Object.freeze({
    detector: requireNonEmptyString(detector, 'detector'),
    type,
    detectedType: type,
    confidence: requireOneOf(
      confidence,
      Object.values(CONFIDENCE_LEVELS),
      'confidence',
    ),
    evidence: requireArray(evidence, 'evidence'),
    warnings: requireArray(warnings, 'warnings'),
    reviewRequired: Boolean(reviewRequired),
    sampleSize,
    details: requireRecord(details, 'details'),
  });
}

/** @returns {RiskAssessment} */
export function createRiskAssessment({
  level = RISK_LEVELS.UNKNOWN,
  reasons = [],
  evidence = [],
  matchedRuleIds = [],
  warnings = [],
  reviewRequired = true,
} = {}) {
  return Object.freeze({
    level: requireOneOf(level, Object.values(RISK_LEVELS), 'level'),
    reasons: requireArray(reasons, 'reasons'),
    evidence: requireArray(evidence, 'evidence'),
    matchedRuleIds: requireArray(matchedRuleIds, 'matchedRuleIds'),
    warnings: requireArray(warnings, 'warnings'),
    reviewRequired: Boolean(reviewRequired),
  });
}

/** @returns {ColumnPolicy} */
export function createColumnPolicy({
  columnName,
  detectedType = 'UNKNOWN',
  riskAssessment = createRiskAssessment(),
  riskLevel = riskAssessment.level,
  recommendedAction = null,
  recommendedActionParams = {},
  selectedAction = null,
  actionParams = {},
  reason = null,
  evidence = [],
  warnings = [],
  userOverride = false,
  reviewRequired = true,
  attributeRole = 'ORDINARY',
  attributeRoleConfidence = 'MEDIUM',
  attributeRoleReason = '',
  attributeRoleSource = 'INFERRED',
  inferredAttributeRole = attributeRole,
  inferredAttributeRoleConfidence = attributeRoleConfidence,
  inferredAttributeRoleReason = attributeRoleReason,
}) {
  if (recommendedAction !== null) {
    requireOneOf(recommendedAction, ACTION_VALUES, 'recommendedAction');
  }
  if (selectedAction !== null) {
    requireOneOf(selectedAction, ACTION_VALUES, 'selectedAction');
  }
  if (reason !== null && typeof reason !== 'string') {
    throw new TypeError('reason must be a string or null.');
  }
  if (!['INFERRED', 'USER'].includes(attributeRoleSource)) throw new RangeError('attributeRoleSource must be INFERRED or USER.');

  return Object.freeze({
    columnName: requireNonEmptyString(columnName, 'columnName'),
    detectedType: requireNonEmptyString(detectedType, 'detectedType'),
    riskAssessment,
    riskLevel: requireOneOf(riskLevel, Object.values(RISK_LEVELS), 'riskLevel'),
    recommendedAction,
    recommendedActionParams: requireRecord(recommendedActionParams, 'recommendedActionParams'),
    selectedAction,
    actionParams: requireRecord(actionParams, 'actionParams'),
    reason,
    evidence: requireArray(evidence, 'evidence'),
    warnings: requireArray(warnings, 'warnings'),
    userOverride: Boolean(userOverride),
    reviewRequired: Boolean(reviewRequired),
    attributeRole: requireOneOf(attributeRole, ATTRIBUTE_ROLE_VALUES, 'attributeRole'),
    attributeRoleConfidence: requireOneOf(attributeRoleConfidence, Object.values(CONFIDENCE_LEVELS), 'attributeRoleConfidence'),
    attributeRoleReason: String(attributeRoleReason),
    attributeRoleSource,
    inferredAttributeRole: requireOneOf(inferredAttributeRole, ATTRIBUTE_ROLE_VALUES, 'inferredAttributeRole'),
    inferredAttributeRoleConfidence: requireOneOf(inferredAttributeRoleConfidence, Object.values(CONFIDENCE_LEVELS), 'inferredAttributeRoleConfidence'),
    inferredAttributeRoleReason: String(inferredAttributeRoleReason),
  });
}

/** @returns {RelationshipRule} */
export function createRelationshipRule({
  id,
  kind,
  columnNames,
  confidence = CONFIDENCE_LEVELS.LOW,
  confidenceScore = null,
  support = null,
  status = null,
  enabled = false,
  evidence = [],
  source = 'DETECTED',
  mappingScope = null,
  reviewRequired = !enabled,
  options = {},
  warnings = [],
}) {
  const frozenColumnNames = requireArray(columnNames, 'columnNames');
  if (frozenColumnNames.length < 2) {
    throw new RangeError('A relationship rule requires at least two columns.');
  }
  if (!['DETECTED', 'USER'].includes(source)) {
    throw new RangeError('source must be DETECTED or USER.');
  }
  if (mappingScope !== null && (typeof mappingScope !== 'string' || mappingScope.trim().length === 0)) {
    throw new TypeError('mappingScope must be a non-empty string or null.');
  }
  const lifecycleStatus = status ?? (source === 'USER' || enabled
    ? RELATIONSHIP_STATUSES.CONFIRMED
    : RELATIONSHIP_STATUSES.CANDIDATE);
  requireOneOf(lifecycleStatus, RELATIONSHIP_STATUS_VALUES, 'status');
  if (confidenceScore !== null && (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1)) {
    throw new RangeError('confidenceScore must be null or a number from 0 to 1.');
  }
  if (support !== null && (!Number.isInteger(support) || support < 0)) {
    throw new RangeError('support must be null or a non-negative integer.');
  }
  if (enabled && lifecycleStatus !== RELATIONSHIP_STATUSES.CONFIRMED) {
    throw new RangeError('Only a confirmed relationship can be enabled.');
  }

  return Object.freeze({
    id: requireNonEmptyString(id, 'id'),
    kind: requireNonEmptyString(kind, 'kind'),
    columnNames: frozenColumnNames,
    confidence: requireOneOf(
      confidence,
      Object.values(CONFIDENCE_LEVELS),
      'confidence',
    ),
    confidenceScore,
    support,
    status: lifecycleStatus,
    confirmed: lifecycleStatus === RELATIONSHIP_STATUSES.CONFIRMED,
    enabled: Boolean(enabled),
    evidence: requireArray(evidence, 'evidence'),
    source,
    mappingScope: mappingScope === null ? null : mappingScope.trim(),
    reviewRequired: Boolean(reviewRequired),
    options: requireRecord(options, 'options'),
    warnings: requireArray(warnings, 'warnings'),
  });
}

/** @returns {CoverageScenario} */
export function createCoverageScenario({
  id,
  kind,
  columnNames,
  priority = 0,
  weight = priority,
  description,
  sensitive = false,
  evidence = [],
  details = {},
}) {
  if (!Number.isFinite(priority)) {
    throw new TypeError('priority must be a finite number.');
  }
  if (!Number.isFinite(weight) || weight < 0) {
    throw new TypeError('weight must be a non-negative finite number.');
  }

  return Object.freeze({
    id: requireNonEmptyString(id, 'id'),
    kind: requireNonEmptyString(kind, 'kind'),
    columnNames: requireArray(columnNames, 'columnNames'),
    priority,
    weight,
    description: requireNonEmptyString(description, 'description'),
    sensitive: Boolean(sensitive),
    evidence: requireArray(evidence, 'evidence'),
    details: requireRecord(details, 'details'),
  });
}

/**
 * @param {Object} [values]
 * @param {number|null} [values.inputRowCount]
 * @param {number} [values.requestedRowCount]
 * @param {number} [values.recommendedMinimumRows]
 * @param {string} [values.strategy]
 * @param {CoverageScenario[]} [values.requiredScenarios]
 * @param {TemplateRowReference[]} [values.selectedTemplateRows]
 * @param {string[]} [values.coveredScenarioIds]
 * @param {string[]} [values.missingScenarioIds]
 * @param {Record<string, unknown>} [values.coverageSummary]
 * @param {ContractWarning[]} [values.warnings]
 * @returns {OutputPlan}
 */
export function createOutputPlan({
  inputRowCount = null,
  requestedRowCount = DEFAULT_OUTPUT_ROW_COUNT,
  recommendedMinimumRows = 0,
  strategy = DEFAULT_OUTPUT_STRATEGY,
  requiredScenarios = [],
  selectedTemplateRows = [],
  coveredScenarioIds = [],
  missingScenarioIds = [],
  coverageSummary = {},
  warnings = [],
} = {}) {
  if (inputRowCount !== null) {
    requireNonNegativeInteger(inputRowCount, 'inputRowCount');
  }
  const validRequestedRowCount = validateRequestedRowCount(requestedRowCount);
  requireNonNegativeInteger(recommendedMinimumRows, 'recommendedMinimumRows');
  requireOneOf(strategy, OUTPUT_STRATEGY_VALUES, 'strategy');

  const derivedWarnings = [...requireArray(warnings, 'warnings')];

  if (validRequestedRowCount > OUTPUT_ROW_WARNING_THRESHOLD) {
    derivedWarnings.push(
      createContractWarning(
        'OUTPUT_ROW_COUNT_ABOVE_RECOMMENDED_THRESHOLD',
        `Generating more than ${OUTPUT_ROW_WARNING_THRESHOLD} rows may take longer than needed for a compact test dataset.`,
        {
          requestedRowCount: validRequestedRowCount,
          warningThreshold: OUTPUT_ROW_WARNING_THRESHOLD,
        },
      ),
    );
  }

  if (
    recommendedMinimumRows > 0 &&
    validRequestedRowCount < recommendedMinimumRows
  ) {
    derivedWarnings.push(
      createContractWarning(
        'OUTPUT_ROWS_BELOW_RECOMMENDED_MINIMUM',
        'The requested output may not cover every required test scenario.',
        { requestedRowCount: validRequestedRowCount, recommendedMinimumRows },
      ),
    );
  }

  return Object.freeze({
    inputRowCount,
    requestedRowCount: validRequestedRowCount,
    recommendedMinimumRows,
    strategy,
    requiredScenarios: requireArray(requiredScenarios, 'requiredScenarios'),
    selectedTemplateRows: requireArray(
      selectedTemplateRows,
      'selectedTemplateRows',
    ),
    coveredScenarioIds: requireArray(coveredScenarioIds, 'coveredScenarioIds'),
    missingScenarioIds: requireArray(missingScenarioIds, 'missingScenarioIds'),
    coverageSummary: requireRecord(coverageSummary, 'coverageSummary'),
    warnings: Object.freeze(derivedWarnings),
  });
}

/** @returns {TransformationContext} */
export function createTransformationContext({
  mode = DEFAULT_MODE,
  outputPlan = createOutputPlan(),
  policies = [],
  relationshipRules = [],
  options = {},
} = {}) {
  return Object.freeze({
    mode: requireOneOf(mode, MODE_VALUES, 'mode'),
    outputPlan,
    policies: requireArray(policies, 'policies'),
    relationshipRules: requireArray(relationshipRules, 'relationshipRules'),
    options: requireRecord(options, 'options'),
  });
}

/** @returns {GenerationResult} */
export function createGenerationResult({
  outputPlan,
  headers = [],
  rows = [],
  issues = [],
  warnings = [],
  sourcePreviewReferences = [],
  validation = {},
  statistics = {},
}) {
  if (!outputPlan || typeof outputPlan !== 'object') {
    throw new TypeError('outputPlan is required.');
  }

  return Object.freeze({
    outputPlan,
    headers: requireArray(headers, 'headers'),
    rows: requireArray(rows, 'rows'),
    issues: requireArray(issues, 'issues'),
    warnings: requireArray(warnings, 'warnings'),
    sourcePreviewReferences: requireArray(sourcePreviewReferences, 'sourcePreviewReferences'),
    validation: requireRecord(validation, 'validation'),
    statistics: requireRecord(statistics, 'statistics'),
  });
}

export { INPUT_SOURCE_KINDS };
