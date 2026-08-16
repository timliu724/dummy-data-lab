import { MODES } from '../core/constants.js';

export function applySafeTestDataMode(policies) {
  return Object.freeze({
    mode: MODES.SAFE_TEST_DATA,
    policies: Object.freeze([...policies]),
    warnings: Object.freeze([]),
  });
}
