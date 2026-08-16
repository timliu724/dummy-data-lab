/**
 * Stable transformation action identifiers.
 *
 * These values are data contracts. UI labels may change later without changing
 * the identifiers persisted in policies or test fixtures.
 */
export const ACTIONS = Object.freeze({
  KEEP: 'KEEP',
  REPLACE: 'REPLACE',
  PATTERN_REPLACE: 'PATTERN_REPLACE',
  SHIFT: 'SHIFT',
  RESAMPLE: 'RESAMPLE',
  GENERALISE: 'GENERALISE',
  TEXT_SANITISE: 'TEXT_SANITISE',
  CLEAR: 'CLEAR',
  DROP: 'DROP',
});

export const ACTION_VALUES = Object.freeze(Object.values(ACTIONS));

/** Overall protection modes. */
export const MODES = Object.freeze({
  ID_ONLY: 'ID_ONLY',
  SAFE_TEST_DATA: 'SAFE_TEST_DATA',
  FULL_SYNTHETIC: 'FULL_SYNTHETIC',
});

export const MODE_VALUES = Object.freeze(Object.values(MODES));
export const DEFAULT_MODE = MODES.SAFE_TEST_DATA;

/** Strategies for choosing a small output set from a potentially large input. */
export const OUTPUT_STRATEGIES = Object.freeze({
  BALANCED: 'BALANCED',
  REPRESENTATIVE: 'REPRESENTATIVE',
  COVERAGE_FIRST: 'COVERAGE_FIRST',
});

export const OUTPUT_STRATEGY_VALUES = Object.freeze(
  Object.values(OUTPUT_STRATEGIES),
);
export const DEFAULT_OUTPUT_STRATEGY = OUTPUT_STRATEGIES.BALANCED;

export const OUTPUT_ROW_PRESETS = Object.freeze([50, 100, 200, 500, 1000]);
export const DEFAULT_OUTPUT_ROW_COUNT = 200;
export const OUTPUT_ROW_WARNING_THRESHOLD = 5000;

export const INPUT_SOURCE_KINDS = Object.freeze({
  FILE: 'FILE',
  PASTE: 'PASTE',
  TEXT: 'TEXT',
});

export const INPUT_SOURCE_KIND_VALUES = Object.freeze(
  Object.values(INPUT_SOURCE_KINDS),
);

export const CONFIDENCE_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

export const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  UNKNOWN: 'UNKNOWN',
});

export const ATTRIBUTE_ROLES = Object.freeze({
  DIRECT_IDENTIFIER: 'DIRECT_IDENTIFIER',
  QUASI_IDENTIFIER: 'QUASI_IDENTIFIER',
  SENSITIVE_ATTRIBUTE: 'SENSITIVE_ATTRIBUTE',
  ORDINARY: 'ORDINARY',
});

export const ATTRIBUTE_ROLE_VALUES = Object.freeze(Object.values(ATTRIBUTE_ROLES));

export const ISSUE_SEVERITIES = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
});

export const MEASUREMENT_STATUSES = Object.freeze({
  NOT_COMPUTED: 'NOT_COMPUTED',
  EXACT: 'EXACT',
  SAMPLED: 'SAMPLED',
  LOWER_BOUND: 'LOWER_BOUND',
  ESTIMATED: 'ESTIMATED',
});
