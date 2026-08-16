import { MODES } from '../core/constants.js';
import { applyFullSyntheticMode } from './full-synthetic.js';
import { applyIdOnlyMode } from './id-only.js';
import { applySafeTestDataMode } from './safe-test-data.js';

export function applyMode(mode, policies) {
  if (!Array.isArray(policies)) throw new TypeError('policies must be an array.');
  if (mode === MODES.ID_ONLY) return applyIdOnlyMode(policies);
  if (mode === MODES.SAFE_TEST_DATA) return applySafeTestDataMode(policies);
  if (mode === MODES.FULL_SYNTHETIC) return applyFullSyntheticMode(policies);
  throw new RangeError(`Unknown protection mode ${mode}.`);
}
