import { createRelationshipRule } from '../core/contracts.js';
import { validateActionParams } from '../policy/action-parameters.js';

export function createUserRelationshipRule({ id, kind, columnNames, mappingScope = null, options = {} }) {
  return createRelationshipRule({
    id,
    kind,
    columnNames,
    confidence: 'HIGH',
    confidenceScore: 1,
    support: null,
    status: 'CONFIRMED',
    enabled: true,
    evidence: ['The relationship was explicitly confirmed by the user.'],
    source: 'USER',
    mappingScope,
    options,
    reviewRequired: false,
  });
}

export function createColumnGroup({ id, columnNames, mappingScope = id }) {
  return createUserRelationshipRule({ id, kind: 'COLUMN_GROUP', columnNames, mappingScope });
}

export function createShiftGroup({
  id,
  shiftKind,
  columnNames,
  offsetMode = 'FIXED',
  offsetValue = null,
  rangeMinimum = null,
  rangeMaximum = null,
  unit = shiftKind === 'NUMBER_SEQUENCE' ? 'INTEGER' : 'DAYS',
  segmentIndex = 0,
  preserveWidth = true,
  allowWidthExpansion = false,
  preserveIntervals = true,
  preserveOrder = true,
}) {
  if (!['DATE_TIME', 'NUMBER_SEQUENCE'].includes(shiftKind)) throw new RangeError('Shift group kind is not supported.');
  const options = {
    shiftKind,
    offsetMode,
    offsetValue,
    rangeMinimum,
    rangeMaximum,
    unit,
    segmentIndex,
    preserveWidth,
    allowWidthExpansion,
    preserveIntervals,
    preserveOrder,
  };
  const validation = validateActionParams({
    action: 'SHIFT',
    detectedType: shiftKind === 'DATE_TIME' ? (unit === 'DAYS' ? 'DATE' : 'TIME') : 'NUMERIC_ID',
    params: options,
  });
  if (!validation.valid) throw new RangeError(validation.errors.join(' '));
  return createUserRelationshipRule({
    id,
    kind: shiftKind === 'DATE_TIME' ? 'DATE_TIME_SHIFT_GROUP' : 'NUMBER_SEQUENCE_SHIFT_GROUP',
    columnNames,
    options,
  });
}
