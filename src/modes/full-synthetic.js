import { ACTIONS, MODES } from '../core/constants.js';

const DISTRIBUTION_TYPES = new Set(['BOOLEAN', 'INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE', 'CATEGORY']);

export function applyFullSyntheticMode(policies) {
  const adjusted = policies.map((policy) => {
    if (policy.selectedAction !== ACTIONS.KEEP) return policy;
    return Object.freeze({
      ...policy,
      selectedAction: DISTRIBUTION_TYPES.has(policy.detectedType) ? ACTIONS.RESAMPLE : ACTIONS.REPLACE,
      reviewRequired: policy.reviewRequired,
    });
  });
  return Object.freeze({
    mode: MODES.FULL_SYNTHETIC,
    policies: Object.freeze(adjusted),
    warnings: Object.freeze([]),
  });
}
