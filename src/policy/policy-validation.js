import { createContractWarning } from '../core/contracts.js';
import { MODE_VALUES } from '../core/constants.js';
import { isKnownAction } from './action-catalog.js';
import { normaliseActionParams, validateActionParams } from './action-parameters.js';

/** @param {object} values */
export function validatePolicySelection({ columnName = null, riskAssessment, detection, recommendedAction, selectedAction }) {
  if (!isKnownAction(recommendedAction) || !isKnownAction(selectedAction)) {
    throw new RangeError('recommendedAction and selectedAction must be known actions.');
  }
  const warnings = [];
  if (selectedAction === 'KEEP' && riskAssessment.level === 'HIGH') {
    warnings.push(createContractWarning(
      'HIGH_RISK_KEEP_OVERRIDE',
      'Keeping a high-risk source field may disclose identifiers or linkable source values.',
      { columnName, detectedType: detection.type, riskLevel: riskAssessment.level },
    ));
  } else if (selectedAction === 'KEEP' && (riskAssessment.level === 'MEDIUM' || detection.confidence === 'LOW')) {
    warnings.push(createContractWarning(
      'REVIEW_REQUIRED_FOR_KEEP',
      'Keeping this field requires review because risk or detection confidence is unresolved.',
      { columnName, detectedType: detection.type, riskLevel: riskAssessment.level, confidence: detection.confidence },
    ));
  }
  if (selectedAction !== recommendedAction) {
    warnings.push(createContractWarning(
      'USER_POLICY_OVERRIDE',
      'The selected action overrides the automatic recommendation.',
      { columnName, recommendedAction, selectedAction },
    ));
  }
  return Object.freeze({
    valid: true,
    warnings: Object.freeze(warnings),
    reviewRequired: warnings.length > 0 || riskAssessment.reviewRequired,
  });
}

export function validatePoliciesForGeneration({ headers, policies, mode, relationshipRegistry = null }) {
  if (!Array.isArray(headers) || !Array.isArray(policies)) {
    throw new TypeError('headers and policies must be arrays.');
  }
  if (!MODE_VALUES.includes(mode)) throw new RangeError('mode is not supported.');
  if (headers.length !== policies.length) {
    throw new RangeError('Exactly one policy is required for each input column.');
  }
  const warnings = [];
  const seenColumns = new Set();
  policies.forEach((policy, index) => {
    if (policy.columnName !== headers[index]) {
      throw new RangeError(`Policy ${index} must align with header ${headers[index]}.`);
    }
    if (seenColumns.has(policy.columnName)) throw new RangeError(`Duplicate policy for ${policy.columnName}.`);
    seenColumns.add(policy.columnName);
    if (!isKnownAction(policy.selectedAction)) throw new RangeError(`Policy ${policy.columnName} has no valid selected action.`);
    let effectiveParams = policy.actionParams;
    if (policy.selectedAction === 'SHIFT' && relationshipRegistry) {
      const columnParams = normaliseActionParams({
        action: 'SHIFT',
        detectedType: policy.detectedType,
        params: policy.actionParams,
      });
      const group = relationshipRegistry.shiftConfigurationFor(policy.columnName, columnParams.shiftKind);
      if (group) effectiveParams = { ...columnParams, ...group.options, groupId: group.id };
    }
    const parameterValidation = validateActionParams({
      action: policy.selectedAction,
      detectedType: policy.detectedType,
      params: effectiveParams,
    });
    if (!parameterValidation.valid) {
      throw new RangeError(`Policy ${policy.columnName} has invalid action parameters: ${parameterValidation.errors.join(' ')}`);
    }
    warnings.push(...(policy.warnings ?? []));
    if (policy.selectedAction === 'KEEP' && (policy.riskLevel === 'HIGH' || policy.reviewRequired)) {
      warnings.push(createContractWarning(
        'GENERATION_KEEP_REQUIRES_REVIEW',
        'Generation will retain source values for a policy that requires review.',
        { columnName: policy.columnName, riskLevel: policy.riskLevel },
      ));
    }
  });
  return Object.freeze({ valid: true, warnings: Object.freeze(warnings) });
}
