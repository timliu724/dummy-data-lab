import { ACTIONS } from '../core/constants.js';
import { executeClear } from './actions/clear.js';
import { executeDrop } from './actions/drop.js';
import { executeGeneralise } from './actions/generalise.js';
import { executeKeep } from './actions/keep.js';
import { executePatternReplace } from './actions/pattern-replace.js';
import { executeReplace } from './actions/replace.js';
import { executeResample } from './actions/resample.js';
import { executeShift } from './actions/shift.js';
import { executeTextSanitise } from './actions/text-sanitise.js';

export const ACTION_EXECUTORS = Object.freeze({
  [ACTIONS.KEEP]: executeKeep,
  [ACTIONS.REPLACE]: executeReplace,
  [ACTIONS.PATTERN_REPLACE]: executePatternReplace,
  [ACTIONS.SHIFT]: executeShift,
  [ACTIONS.RESAMPLE]: executeResample,
  [ACTIONS.GENERALISE]: executeGeneralise,
  [ACTIONS.TEXT_SANITISE]: executeTextSanitise,
  [ACTIONS.CLEAR]: executeClear,
  [ACTIONS.DROP]: executeDrop,
});

export function outputHeadersForPolicies(headers, policies) {
  return Object.freeze(headers.filter((header, index) => policies[index]?.selectedAction !== ACTIONS.DROP));
}

export function transformRow({ row, headers, policies, profiles = [], detections = [], context }) {
  if (!Array.isArray(row) || !Array.isArray(headers) || !Array.isArray(policies)) {
    throw new TypeError('row, headers, and policies must be arrays.');
  }
  if (headers.length !== policies.length) throw new RangeError('policies must align with headers.');
  const transformed = [];
  const outputHeaders = [];
  const warnings = [];
  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    const policy = policies[columnIndex];
    const executor = ACTION_EXECUTORS[policy.selectedAction];
    if (!executor) throw new RangeError(`Unsupported action ${policy.selectedAction}.`);
    const result = executor({
      value: row[columnIndex] ?? '',
      columnIndex,
      policy,
      profile: profiles[columnIndex],
      detection: detections[columnIndex],
      context,
      row,
    });
    warnings.push(...result.warnings);
    if (!result.dropped) {
      outputHeaders.push(headers[columnIndex]);
      transformed.push(result.value);
    }
  }
  const businessRelated = context.options?.deferBusinessRelationships
    ? { row: transformed, warnings: [] }
    : context.businessRelationshipPreserver?.applyToRow({
        outputHeaders,
        transformedRow: transformed,
      }) ?? { row: transformed, warnings: [] };
  warnings.push(...businessRelated.warnings);
  const related = context.relationshipRegistry?.applyToRow({
    originalRow: row,
    headers,
    outputHeaders,
    transformedRow: businessRelated.row,
    context,
  }) ?? { row: transformed, warnings: [] };
  warnings.push(...related.warnings);
  return Object.freeze({
    headers: Object.freeze([...outputHeaders]),
    row: Object.freeze([...related.row]),
    warnings: Object.freeze(warnings),
  });
}
