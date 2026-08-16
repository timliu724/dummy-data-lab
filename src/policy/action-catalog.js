import { ACTIONS, ACTION_VALUES } from '../core/constants.js';

export const ACTION_CATALOG = Object.freeze({
  [ACTIONS.KEEP]: Object.freeze({ description: 'Retain the source value only when risk is acceptably low.', destructive: false }),
  [ACTIONS.REPLACE]: Object.freeze({ description: 'Replace with a new value of the detected semantic type.', destructive: true }),
  [ACTIONS.PATTERN_REPLACE]: Object.freeze({ description: 'Create a new value that preserves only a safe structural pattern.', destructive: true }),
  [ACTIONS.SHIFT]: Object.freeze({ description: 'Shift temporal or numeric values without retaining the original.', destructive: true }),
  [ACTIONS.RESAMPLE]: Object.freeze({ description: 'Draw from a safe bounded distribution rather than copy row-for-row.', destructive: true }),
  [ACTIONS.GENERALISE]: Object.freeze({ description: 'Reduce precision or map values to broader groups.', destructive: true }),
  [ACTIONS.TEXT_SANITISE]: Object.freeze({ description: 'Remove identifying spans and unsafe free-text content.', destructive: true }),
  [ACTIONS.CLEAR]: Object.freeze({ description: 'Emit an empty value.', destructive: true }),
  [ACTIONS.DROP]: Object.freeze({ description: 'Remove the column from generated output.', destructive: true }),
});

export function isKnownAction(action) {
  return ACTION_VALUES.includes(action);
}

export { ACTIONS, ACTION_VALUES };
