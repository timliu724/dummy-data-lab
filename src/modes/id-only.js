import { createContractWarning } from '../core/contracts.js';
import { ACTIONS, MODES } from '../core/constants.js';

const DIRECT_TYPES = new Set([
  'EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE', 'NUMERIC_ID', 'ALPHANUMERIC_CODE',
  'AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE',
]);

export function applyIdOnlyMode(policies) {
  const adjusted = policies.map((policy) => {
    if (DIRECT_TYPES.has(policy.detectedType)) return policy;
    return Object.freeze({
      ...policy,
      selectedAction: ACTIONS.KEEP,
      reviewRequired: policy.reviewRequired || policy.riskLevel !== 'LOW',
    });
  });
  return Object.freeze({
    mode: MODES.ID_ONLY,
    policies: Object.freeze(adjusted),
    warnings: Object.freeze([createContractWarning(
      'ID_ONLY_IS_PSEUDONYMISATION',
      'ID Only changes direct identifiers but leaves indirect identifiers and source structure; it is pseudonymisation, not anonymisation.',
      {},
    )]),
  });
}
