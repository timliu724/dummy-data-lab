import { createContractWarning } from '../../core/contracts.js';

export function executeKeep({ value, policy }) {
  const warnings = [];
  if (policy.riskLevel !== 'LOW' || policy.reviewRequired) {
    warnings.push(createContractWarning(
      'KEEP_RETAINS_SOURCE_VALUE',
      'KEEP retained a source value in a column that still requires privacy review.',
      { columnName: policy.columnName, riskLevel: policy.riskLevel },
    ));
  }
  return Object.freeze({ value, dropped: false, warnings: Object.freeze(warnings) });
}
