import { createColumnPolicy } from '../core/contracts.js';
import { DEFAULT_MODE, MODES } from '../core/constants.js';
import { ACTIONS } from './action-catalog.js';
import { POLICY_REASONS } from './reasons.js';
import { validatePolicySelection } from './policy-validation.js';
import { defaultActionParams, normaliseActionParams } from './action-parameters.js';
import { inferAttributeRole } from '../privacy/attribute-roles.js';
import { isOrganisationNameHeader, normalizeHeader } from '../detection/header-normalization.js';

const STRUCTURED_REFERENCE_HEADER = /(^|_)(batch_(?:id|no|number)|part_(?:id|no|number)|so_(?:id|no|number)|(?:sales|service|work|purchase|repair)_order(?:_(?:id|no|number))?|order_(?:id|no|number)|job_(?:id|no|number)|submission_id|serial_(?:id|no|number)|ticket_(?:id|no|number)|case_(?:id|no|number)|request_(?:id|no|number)|(?:asc|service_centre|service_center|dealer|vendor|supplier)_code|file_name|filename)(_|$)/;
const COMPACT_STRUCTURED_REFERENCE_HEADER = /^(?:sales|service|work|purchase|repair)order(?:id|no|number)?$/;
const MODEL_REFERENCE_HEADER = /(^|_)(product_model|factory_model|model_(?:no|number))(_|$)/;
const OPERATIONAL_VOCABULARY_HEADER = /(^|_)(status|state|stage|region|accuracy|service_type|warranty_term|reason_code|symptom_code)(_|$)/;
const LOCATION_HEADER = /(^|_)(address(?:_line_\d+)?|street_address|suburb|city|town|locality|state|province|territory|postcode|post_code|postal_code|zip|zip_code)(_|$)/;
const BOUNDED_PUBLIC_LOCATION_HEADER = /(^|_)(state|province|territory|country|region)(_|$)/;

function isStructuredReference(profile) {
  const header = normalizeHeader(profile.columnName);
  return header === 'collection_point'
    || STRUCTURED_REFERENCE_HEADER.test(header)
    || COMPACT_STRUCTURED_REFERENCE_HEADER.test(header)
    || MODEL_REFERENCE_HEADER.test(header);
}

function isMixedStructuredReferenceText(profile, detection) {
  if (!isStructuredReference(profile)
    || !['GENERAL_TEXT', 'FREE_TEXT'].includes(detection.type)
    || (profile.nonEmptyCount ?? 0) < 5) return false;
  const phraseCountLowerBound = (profile.topValues ?? [])
    .filter((entry) => /\p{L}[^\r\n]*\s+[^\r\n]*\p{L}/u.test(String(entry.value ?? '')))
    .reduce((sum, entry) => sum + Math.max(0, (entry.count ?? 0) - (entry.error ?? 0)), 0);
  return phraseCountLowerBound / profile.nonEmptyCount >= 0.5;
}

function hasSingleSourceValue(profile) {
  return (profile.nonEmptyCount ?? 0) > 0
    && profile.uniqueCountStatus === 'EXACT'
    && profile.uniqueCount === 1;
}

function isOperationalVocabulary(profile) {
  const header = normalizeHeader(profile.columnName);
  const maximumUniqueValues = /(^|_)(code|reason_code|symptom_code)(_|$)/.test(header) ? 64 : 12;
  if ((profile.nonEmptyCount ?? 0) < 2
    || profile.uniqueCountStatus !== 'EXACT'
    || (profile.uniqueCount ?? Number.POSITIVE_INFINITY) < 2
    || (profile.uniqueCount ?? Number.POSITIVE_INFINITY) > maximumUniqueValues
    || (profile.uniqueRatio ?? 1) > 0.75
    || (profile.lengthStats?.maximum ?? Number.POSITIVE_INFINITY) > 40) return false;
  return OPERATIONAL_VOCABULARY_HEADER.test(header);
}

function isMixedOperationalText(profile) {
  return (profile.nonEmptyCount ?? 0) >= 5
    && (profile.uniqueRatio ?? 1) <= 0.25
    && (profile.lengthStats?.maximum ?? 0) > 40
    && OPERATIONAL_VOCABULARY_HEADER.test(normalizeHeader(profile.columnName));
}

function isLocationField(profile, detection) {
  return detection.type === 'ADDRESS_LIKE'
    || LOCATION_HEADER.test(normalizeHeader(profile.columnName));
}

function isBoundedPublicLocationVocabulary(profile) {
  const header = normalizeHeader(profile.columnName);
  const fixedPublicVocabulary = /(^|_)(state|province|territory|country)(_|$)/.test(header);
  return BOUNDED_PUBLIC_LOCATION_HEADER.test(header)
    && profile.uniqueCountStatus === 'EXACT'
    && (profile.uniqueCount ?? 0) >= 2
    && (profile.uniqueCount ?? Number.POSITIVE_INFINITY) <= 16
    && (fixedPublicVocabulary || (profile.uniqueRatio ?? 1) <= 0.75);
}

function hasStrongUnlabelledPattern(profile, detection) {
  const pattern = detection.details?.pattern;
  if (pattern?.multiValue?.autoEnabled === true) return true;
  const dominant = pattern?.dominantShape;
  return (profile.uniqueRatio ?? 0) >= 0.5
    && (profile.lengthStats?.maximum ?? Number.POSITIVE_INFINITY) <= 64
    && (pattern?.sampleSize ?? 0) >= 20
    && (dominant?.coverage ?? 0) >= 0.8
    && /9/u.test(String(dominant?.value ?? ''));
}

/** @param {object} values */
function chooseRecommendation({ profile, detection, riskAssessment, mode, attributeRole }) {
  const type = detection.type;
  if (type === 'EMPTY') return [ACTIONS.KEEP, POLICY_REASONS.EMPTY_KEEP];
  if (mode === MODES.FULL_SYNTHETIC) {
    if (['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE', 'CATEGORY', 'BOOLEAN'].includes(type)) {
      return [ACTIONS.RESAMPLE, POLICY_REASONS.FULL_SYNTHETIC];
    }
    return [ACTIONS.REPLACE, POLICY_REASONS.FULL_SYNTHETIC];
  }
  if (isBoundedPublicLocationVocabulary(profile)) return [ACTIONS.RESAMPLE, POLICY_REASONS.CATEGORY_RESAMPLE];
  if (isLocationField(profile, detection)) return [ACTIONS.REPLACE, POLICY_REASONS.LOCATION_REPLACE];
  if (type === 'NAME_LIKE' && isOrganisationNameHeader(profile.columnName)) {
    return [ACTIONS.REPLACE, POLICY_REASONS.ORGANISATION_NAME_REPLACE];
  }
  if (['EMAIL', 'NAME_LIKE'].includes(type)) return [ACTIONS.REPLACE, POLICY_REASONS.DIRECT_REPLACE];
  if (attributeRole.role === 'ORDINARY' && isMixedStructuredReferenceText(profile, detection)) {
    return [ACTIONS.REPLACE, POLICY_REASONS.MIXED_REFERENCE_TEXT_REPLACE];
  }
  if (attributeRole.role === 'ORDINARY' && isStructuredReference(profile) && ['INTEGER', 'DECIMAL', 'CATEGORY', 'GENERAL_TEXT', 'FREE_TEXT'].includes(type)) {
    return [ACTIONS.PATTERN_REPLACE, POLICY_REASONS.STRUCTURED_REFERENCE_PATTERN];
  }
  if (attributeRole.role === 'ORDINARY' && isStructuredReference(profile) && ['NUMERIC_ID', 'ALPHANUMERIC_CODE'].includes(type)) {
    return [ACTIONS.PATTERN_REPLACE, POLICY_REASONS.STRUCTURED_REFERENCE_PATTERN];
  }
  if (hasSingleSourceValue(profile)
    && !['NUMERIC_ID', 'ALPHANUMERIC_CODE', 'DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(type)
    && ['ORDINARY', 'SENSITIVE_ATTRIBUTE'].includes(attributeRole.role)) {
    return [ACTIONS.REPLACE, POLICY_REASONS.CONSTANT_REPLACE];
  }
  if (attributeRole.role === 'ORDINARY' && isOperationalVocabulary(profile) && ['CATEGORY', 'GENERAL_TEXT', 'ALPHANUMERIC_CODE', 'INTEGER'].includes(type)) {
    return [ACTIONS.RESAMPLE, POLICY_REASONS.OPERATIONAL_VOCABULARY_RESAMPLE];
  }
  if (type === 'PHONE_LIKE' || type === 'NUMERIC_ID' || type === 'ALPHANUMERIC_CODE' || type.startsWith('AU_')) {
    return [ACTIONS.PATTERN_REPLACE, POLICY_REASONS.ID_PATTERN];
  }
  if (attributeRole.role === 'ORDINARY' && ['GENERAL_TEXT', 'FREE_TEXT'].includes(type) && hasStrongUnlabelledPattern(profile, detection)) {
    return [ACTIONS.PATTERN_REPLACE, POLICY_REASONS.STRONG_UNLABELLED_PATTERN];
  }
  if (attributeRole.role === 'ORDINARY' && type === 'GENERAL_TEXT' && isMixedOperationalText(profile)) {
    return [ACTIONS.REPLACE, POLICY_REASONS.MIXED_OPERATIONAL_TEXT_REPLACE];
  }
  if (type === 'FREE_TEXT') return [ACTIONS.TEXT_SANITISE, POLICY_REASONS.FREE_TEXT_SANITISE];
  if (type === 'UNKNOWN' && detection.details?.unsupportedTemporal === true) {
    return [ACTIONS.KEEP, POLICY_REASONS.TEMPORAL_REVIEW_KEEP];
  }
  if (type === 'UNKNOWN' || detection.confidence === 'LOW') return [ACTIONS.CLEAR, POLICY_REASONS.UNKNOWN_CLEAR];
  if (attributeRole.role === 'DIRECT_IDENTIFIER') {
    if (['INTEGER', 'DECIMAL', 'ALPHANUMERIC_CODE', 'NUMERIC_ID'].includes(type)) {
      return [ACTIONS.PATTERN_REPLACE, POLICY_REASONS.ROLE_DIRECT_REPLACE];
    }
    return [ACTIONS.REPLACE, POLICY_REASONS.ROLE_DIRECT_REPLACE];
  }
  if (attributeRole.role === 'QUASI_IDENTIFIER') {
    if (['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE', 'CATEGORY', 'GENERAL_TEXT', 'DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(type)) {
      return [ACTIONS.GENERALISE, POLICY_REASONS.ROLE_QUASI_GENERALISE];
    }
    return [ACTIONS.REPLACE, POLICY_REASONS.ROLE_QUASI_GENERALISE];
  }
  if (attributeRole.role === 'SENSITIVE_ATTRIBUTE') {
    if (['CATEGORY', 'DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(type)) {
      return [ACTIONS.GENERALISE, POLICY_REASONS.ROLE_SENSITIVE_GENERALISE];
    }
    if (['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE', 'BOOLEAN'].includes(type)) {
      return [ACTIONS.RESAMPLE, POLICY_REASONS.ROLE_SENSITIVE_RESAMPLE];
    }
    return [ACTIONS.REPLACE, POLICY_REASONS.ROLE_DIRECT_REPLACE];
  }
  if (['DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE'].includes(type)) {
    if (detection.details?.headerSemanticHint) {
      return [ACTIONS.REPLACE, 'The header suggests a date or time, but the source format was not parseable enough for a safe fixed SHIFT.'];
    }
    return [ACTIONS.SHIFT, POLICY_REASONS.DATE_SHIFT];
  }
  if (type === 'CATEGORY') {
    return riskAssessment.level === 'HIGH'
      ? [ACTIONS.REPLACE, POLICY_REASONS.HIGH_RISK_CATEGORY_REPLACE]
      : [ACTIONS.RESAMPLE, POLICY_REASONS.CATEGORY_RESAMPLE];
  }
  if (['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE'].includes(type)) {
    return [ACTIONS.RESAMPLE, POLICY_REASONS.NUMERIC_RESAMPLE];
  }
  if (type === 'BOOLEAN' && riskAssessment.level === 'LOW') {
    return [ACTIONS.KEEP, POLICY_REASONS.LOW_RISK_KEEP];
  }
  if (mode === MODES.ID_ONLY && riskAssessment.level === 'LOW') {
    return [ACTIONS.KEEP, POLICY_REASONS.LOW_RISK_KEEP];
  }
  return [ACTIONS.REPLACE, POLICY_REASONS.ORDINARY_TEXT_REPLACE];
}

/** @param {object} values */
export function recommendColumnPolicy({
  profile,
  detection,
  riskAssessment,
  mode = DEFAULT_MODE,
  userAction = null,
}) {
  const attributeRole = inferAttributeRole({ profile, detection, riskAssessment });
  const [recommendedAction, reason] = chooseRecommendation({ profile, detection, riskAssessment, mode, attributeRole });
  const selectedAction = userAction ?? recommendedAction;
  const pattern = detection.details?.pattern;
  const autoPrefixGroups = [
    ...(pattern?.prefixGroups ?? []),
    ...(pattern?.multiValue?.itemPrefixGroups ?? []),
  ].map((entry) => entry.value);
  const autoSuffixGroups = [
    ...(pattern?.suffixGroups ?? []),
    ...(pattern?.multiValue?.itemSuffixGroups ?? []),
  ].map((entry) => entry.value);
  const structuralPatternParams = recommendedAction === ACTIONS.PATTERN_REPLACE
    ? {
        autoPrefixGroups: [...new Set(autoPrefixGroups)],
        autoSuffixGroups: [...new Set(autoSuffixGroups)],
        multiValueMode: 'AUTO',
        multiValueDetected: pattern?.multiValue?.autoEnabled === true,
        multiValueConfidence: pattern?.multiValue?.confidence ?? 'LOW',
        multiValueItemShape: pattern?.multiValue?.itemShape ?? '',
        multiValueSeparatorKinds: pattern?.multiValue?.separatorKinds ?? [],
      }
    : {};
  const roleGeneralisationParams = recommendedAction === ACTIONS.GENERALISE
    && attributeRole.role === 'QUASI_IDENTIFIER'
    && detection.type === 'GENERAL_TEXT'
    ? { strategy: 'CATEGORY_GROUP', level: 'MEDIUM' }
    : {};
  const recommendedActionParams = normaliseActionParams({
    action: recommendedAction,
    detectedType: detection.type,
    params: {
      ...defaultActionParams(recommendedAction, detection.type),
      ...structuralPatternParams,
      ...roleGeneralisationParams,
    },
  });
  const actionParams = selectedAction === recommendedAction
    ? recommendedActionParams
    : defaultActionParams(selectedAction, detection.type);
  const groupSummary = recommendedAction === ACTIONS.PATTERN_REPLACE
    ? [...recommendedActionParams.autoPrefixGroups, ...recommendedActionParams.autoSuffixGroups]
    : [];
  const structuralReason = groupSummary.length > 0
    ? `${reason} Detected structural group${groupSummary.length === 1 ? '' : 's'} ${groupSummary.join(', ')}; Smart structure preserves the matching group and regenerates the remaining letters or digits.`
    : reason;
  const multiValueReason = recommendedAction === ACTIONS.PATTERN_REPLACE && pattern?.multiValue?.autoEnabled
    ? ` Detected repeated ${pattern.multiValue.itemShape} items inside some cells; each item is transformed separately while original separators are preserved.`
    : pattern?.multiValue?.detected
      ? ' Possible multiple values were detected, but confidence was not high enough to enable automatic splitting.'
      : '';
  const explainedReason = `${structuralReason}${multiValueReason}`;
  const validation = validatePolicySelection({
    columnName: profile.columnName,
    riskAssessment,
    detection,
    recommendedAction,
    recommendedActionParams,
    selectedAction,
    actionParams,
  });
  return createColumnPolicy({
    columnName: profile.columnName,
    detectedType: detection.type,
    riskAssessment,
    recommendedAction,
    recommendedActionParams,
    selectedAction,
    actionParams,
    reason: explainedReason,
    evidence: Object.freeze([...riskAssessment.evidence, ...detection.evidence]),
    warnings: validation.warnings,
    userOverride: userAction !== null,
    reviewRequired: validation.reviewRequired,
    attributeRole: attributeRole.role,
    attributeRoleConfidence: attributeRole.confidence,
    attributeRoleReason: attributeRole.reason,
    attributeRoleSource: attributeRole.source,
    inferredAttributeRole: attributeRole.role,
    inferredAttributeRoleConfidence: attributeRole.confidence,
    inferredAttributeRoleReason: attributeRole.reason,
  });
}

/** @param {object} values */
export function recommendPolicies({ tableProfile, detections, tableRisk, mode = DEFAULT_MODE, userActions = {} }) {
  return Object.freeze(tableProfile.columns.map((profile, index) => recommendColumnPolicy({
    profile,
    detection: detections[index],
    riskAssessment: tableRisk.columns[index].assessment,
    mode,
    userAction: userActions[profile.columnName] ?? null,
  })));
}
