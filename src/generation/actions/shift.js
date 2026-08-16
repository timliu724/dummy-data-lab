import {
  normaliseActionParams,
  OFFSET_MODES,
  SHIFT_KINDS,
  SHIFT_UNITS,
  validateActionParams,
} from '../../policy/action-parameters.js';
import { resolveDateOrientation } from '../date-shift-context.js';
import { shiftDateByDays, shiftNumericSegment, shiftTimeByMinutes } from '../fixed-shift.js';

function resolveOffset(params, policy, context) {
  if (params.offsetMode === OFFSET_MODES.FIXED) return params.offsetValue;
  const minimum = Number(params.rangeMinimum);
  const maximum = Number(params.rangeMaximum);
  const scope = params.groupId ?? `column:${policy.columnName}`;
  return context.dateShiftContext.configuredOffsetFor(scope, minimum, maximum);
}

export function executeShift({ value, policy, detection, context }) {
  const columnParams = normaliseActionParams({ action: 'SHIFT', detectedType: policy.detectedType, params: policy.actionParams });
  const group = context.relationshipRegistry?.shiftConfigurationFor(policy.columnName, columnParams.shiftKind) ?? null;
  const params = normaliseActionParams({
    action: 'SHIFT',
    detectedType: policy.detectedType,
    params: group ? { ...columnParams, ...group.options, groupId: group.id } : { ...columnParams, groupId: null },
  });
  const validation = validateActionParams({ action: 'SHIFT', detectedType: policy.detectedType, params });
  if (!validation.valid) throw new RangeError(`SHIFT for ${policy.columnName} is not configured: ${validation.errors.join(' ')}`);
  if (value === null || value === undefined || String(value).trim() === '') {
    return Object.freeze({ value: '', dropped: false, warnings: Object.freeze([]) });
  }
  const offset = resolveOffset(params, policy, context);
  let shifted;
  try {
    if (params.shiftKind === SHIFT_KINDS.NUMBER_SEQUENCE) {
      shifted = shiftNumericSegment(value, {
        offset,
        segmentIndex: params.segmentIndex,
        preserveWidth: params.preserveWidth,
        allowWidthExpansion: params.allowWidthExpansion,
      });
    } else if (policy.detectedType === 'TIME') {
      const minutes = params.unit === SHIFT_UNITS.HOURS ? Number(offset) * 60 : Number(offset);
      shifted = shiftTimeByMinutes(value, minutes);
    } else {
      if (params.unit !== SHIFT_UNITS.DAYS) throw new RangeError('Date SHIFT currently requires DAYS.');
      shifted = shiftDateByDays(value, Number(offset), resolveDateOrientation({ actionParams: params, detection }));
    }
  } catch (error) {
    const rowLabel = Number.isInteger(context.sourceRowIndex) ? ` at source data row ${context.sourceRowIndex + 1}` : '';
    throw new RangeError(`SHIFT failed for column "${policy.columnName}"${rowLabel}: ${error.message}`);
  }
  return Object.freeze({ value: shifted, dropped: false, warnings: Object.freeze([]) });
}
