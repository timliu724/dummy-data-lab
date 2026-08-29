export const SHIFT_KINDS = Object.freeze({
  DATE_TIME: 'DATE_TIME',
  NUMBER_SEQUENCE: 'NUMBER_SEQUENCE',
});

export const OFFSET_MODES = Object.freeze({
  FIXED: 'FIXED',
  RANDOM_ONCE: 'RANDOM_ONCE',
});

export const SHIFT_UNITS = Object.freeze({
  DAYS: 'DAYS',
  HOURS: 'HOURS',
  MINUTES: 'MINUTES',
  INTEGER: 'INTEGER',
});

export const REPLACEMENT_BEHAVIORS = Object.freeze({
  AUTO: 'AUTO',
  CONSISTENT: 'CONSISTENT',
  INDEPENDENT: 'INDEPENDENT',
});

export const PATTERN_MODES = Object.freeze({
  AUTO: 'AUTO',
  REGENERATE_ALL: 'REGENERATE_ALL',
  CUSTOM: 'CUSTOM',
});

export const MULTI_VALUE_MODES = Object.freeze({
  AUTO: 'AUTO',
  FORCE: 'FORCE',
  OFF: 'OFF',
});

export const PATTERN_PART_ACTIONS = Object.freeze({
  DEFAULT: 'DEFAULT',
  KEEP: 'KEEP',
  GENERATE: 'GENERATE',
  REPLACE: 'REPLACE',
});

const NON_SHIFT_DEFAULTS = Object.freeze({
  KEEP: Object.freeze({ preserveNulls: true }),
  REPLACE: Object.freeze({
    mappingScope: 'COLUMN',
    repeatHandling: REPLACEMENT_BEHAVIORS.AUTO,
    preserveNulls: true,
    uniqueness: 'AUTO',
  }),
  PATTERN_REPLACE: Object.freeze({
    repeatHandling: REPLACEMENT_BEHAVIORS.AUTO,
    patternMode: PATTERN_MODES.AUTO,
    autoPrefixGroups: Object.freeze([]),
    autoSuffixGroups: Object.freeze([]),
    multiValueMode: MULTI_VALUE_MODES.AUTO,
    multiValueDetected: false,
    multiValueConfidence: 'LOW',
    multiValueItemShape: '',
    multiValueSeparatorKinds: Object.freeze([]),
    customDefaultAction: PATTERN_PART_ACTIONS.GENERATE,
    prefixAction: PATTERN_PART_ACTIONS.DEFAULT,
    prefixLength: 0,
    prefixReplacement: '',
    suffixAction: PATTERN_PART_ACTIONS.DEFAULT,
    suffixLength: 0,
    suffixReplacement: '',
    segmentRules: Object.freeze([]),
    preserveNulls: true,
    preserveCase: true,
    preserveSymbols: true,
    preservePrefix: true,
    preserveSuffix: true,
    uniqueness: 'AUTO',
  }),
  RESAMPLE: Object.freeze({ source: 'PROFILE_DISTRIBUTION', preserveNullRate: true }),
  GENERALISE: Object.freeze({ strategy: 'AUTO', level: 'MEDIUM', preserveNulls: true }),
  TEXT_SANITISE: Object.freeze({ uncertainValue: 'CLEAR', replacementStyle: 'SYNTHETIC_NOTE' }),
  CLEAR: Object.freeze({ outputValue: '' }),
  DROP: Object.freeze({}),
});

function inferredShiftKind(detectedType) {
  return ['DATE', 'AMBIGUOUS_DATE', 'DATETIME', 'TIME'].includes(detectedType)
    ? SHIFT_KINDS.DATE_TIME
    : SHIFT_KINDS.NUMBER_SEQUENCE;
}

function inferredUnit(detectedType, shiftKind) {
  if (shiftKind === SHIFT_KINDS.NUMBER_SEQUENCE) return SHIFT_UNITS.INTEGER;
  return detectedType === 'TIME' ? SHIFT_UNITS.MINUTES : SHIFT_UNITS.DAYS;
}

export function defaultActionParams(action, detectedType = 'UNKNOWN') {
  if (action !== 'SHIFT') return Object.freeze({ ...(NON_SHIFT_DEFAULTS[action] ?? {}) });
  const shiftKind = inferredShiftKind(detectedType);
  return Object.freeze({
    shiftKind,
    offsetMode: OFFSET_MODES.FIXED,
    offsetValue: null,
    rangeMinimum: null,
    rangeMaximum: null,
    unit: inferredUnit(detectedType, shiftKind),
    segmentIndex: 0,
    preserveWidth: true,
    allowWidthExpansion: false,
    dateOrientation: null,
    groupId: null,
  });
}

export function normaliseActionParams({ action, detectedType = 'UNKNOWN', params = {} }) {
  if (action !== 'SHIFT') {
    const merged = { ...defaultActionParams(action, detectedType), ...params };
    if (action === 'GENERALISE') {
      return Object.freeze({
        ...merged,
        strategy: String(merged.strategy ?? 'AUTO').toUpperCase(),
        level: String(merged.level ?? 'MEDIUM').toUpperCase(),
      });
    }
    if (action !== 'PATTERN_REPLACE') return Object.freeze(merged);
    const integerOrZero = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      const number = Number(value);
      return Number.isInteger(number) ? number : Number.NaN;
    };
    const segmentRules = Array.isArray(params.segmentRules)
      ? params.segmentRules.map((rule) => Object.freeze({
          segmentIndex: integerOrZero(rule?.segmentIndex),
          action: String(rule?.action ?? PATTERN_PART_ACTIONS.DEFAULT).toUpperCase(),
          replacement: String(rule?.replacement ?? ''),
        }))
      : [];
    const normaliseGroups = (values) => Object.freeze([...new Set(
      (Array.isArray(values) ? values : []).map(String).filter((value) => value.length > 0),
    )].slice(0, 8));
    const normaliseSeparatorKinds = (values) => Object.freeze([...new Set(
      (Array.isArray(values) ? values : []).map((value) => String(value).toUpperCase()),
    )].slice(0, 6));
    return Object.freeze({
      ...merged,
      patternMode: String(merged.patternMode ?? PATTERN_MODES.AUTO).toUpperCase(),
      autoPrefixGroups: normaliseGroups(merged.autoPrefixGroups),
      autoSuffixGroups: normaliseGroups(merged.autoSuffixGroups),
      multiValueMode: String(merged.multiValueMode ?? MULTI_VALUE_MODES.AUTO).toUpperCase(),
      multiValueDetected: merged.multiValueDetected === true,
      multiValueConfidence: String(merged.multiValueConfidence ?? 'LOW').toUpperCase(),
      multiValueItemShape: String(merged.multiValueItemShape ?? '').slice(0, 256),
      multiValueSeparatorKinds: normaliseSeparatorKinds(merged.multiValueSeparatorKinds),
      customDefaultAction: String(merged.customDefaultAction ?? PATTERN_PART_ACTIONS.GENERATE).toUpperCase(),
      prefixAction: String(merged.prefixAction ?? PATTERN_PART_ACTIONS.DEFAULT).toUpperCase(),
      prefixLength: integerOrZero(merged.prefixLength),
      prefixReplacement: String(merged.prefixReplacement ?? ''),
      suffixAction: String(merged.suffixAction ?? PATTERN_PART_ACTIONS.DEFAULT).toUpperCase(),
      suffixLength: integerOrZero(merged.suffixLength),
      suffixReplacement: String(merged.suffixReplacement ?? ''),
      segmentRules: Object.freeze(segmentRules),
    });
  }
  const defaults = defaultActionParams(action, detectedType);
  const shiftKind = params.shiftKind ?? defaults.shiftKind;
  return Object.freeze({
    ...defaults,
    ...params,
    shiftKind,
    offsetMode: params.offsetMode ?? defaults.offsetMode,
    offsetValue: params.offsetValue === null || params.offsetValue === undefined || params.offsetValue === ''
      ? null
      : String(params.offsetValue).trim(),
    rangeMinimum: params.rangeMinimum === null || params.rangeMinimum === undefined || params.rangeMinimum === ''
      ? null
      : String(params.rangeMinimum).trim(),
    rangeMaximum: params.rangeMaximum === null || params.rangeMaximum === undefined || params.rangeMaximum === ''
      ? null
      : String(params.rangeMaximum).trim(),
    unit: params.unit ?? inferredUnit(detectedType, shiftKind),
    segmentIndex: Number.isInteger(Number(params.segmentIndex)) ? Number(params.segmentIndex) : 0,
    preserveWidth: params.preserveWidth !== false,
    allowWidthExpansion: params.allowWidthExpansion === true,
    dateOrientation: params.dateOrientation ? String(params.dateOrientation).toUpperCase() : null,
    groupId: params.groupId ? String(params.groupId) : null,
  });
}

function isIntegerText(value) {
  return typeof value === 'string' && /^[+-]?\d+$/.test(value);
}

export function validateActionParams({ action, detectedType = 'UNKNOWN', params = {} }) {
  const errors = [];
  const knownActions = new Set([...Object.keys(NON_SHIFT_DEFAULTS), 'SHIFT']);
  if (!knownActions.has(action)) errors.push('Action parameters require a known action.');
  if (action !== 'SHIFT') {
    const current = normaliseActionParams({ action, detectedType, params });
    if (['REPLACE', 'PATTERN_REPLACE'].includes(action) && !['AUTO', 'REQUIRED', 'NOT_REQUIRED'].includes(current.uniqueness)) {
      errors.push('Uniqueness must be AUTO, REQUIRED, or NOT_REQUIRED.');
    }
    if (['REPLACE', 'PATTERN_REPLACE'].includes(action)
      && !Object.values(REPLACEMENT_BEHAVIORS).includes(current.repeatHandling)) {
      errors.push('Repeat handling must be AUTO, CONSISTENT, or INDEPENDENT.');
    }
    if (action === 'PATTERN_REPLACE') {
      if (!Object.values(PATTERN_MODES).includes(current.patternMode)) {
        errors.push('Pattern mode must be AUTO, REGENERATE_ALL, or CUSTOM.');
      }
      if (!Object.values(MULTI_VALUE_MODES).includes(current.multiValueMode)) {
        errors.push('Multi-value handling must be AUTO, FORCE, or OFF.');
      }
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(current.multiValueConfidence)) {
        errors.push('Multi-value confidence must be LOW, MEDIUM, or HIGH.');
      }
      if (current.multiValueItemShape && !/^[^\s,;|/<>]{1,256}$/u.test(current.multiValueItemShape)) {
        errors.push('Multi-value item shape contains unsupported characters.');
      }
      const allowedSeparatorKinds = new Set(['WHITESPACE', 'COMMA', 'SEMICOLON', 'PIPE', 'SLASH', 'MIXED']);
      if (current.multiValueSeparatorKinds.some((value) => !allowedSeparatorKinds.has(value))) {
        errors.push('Multi-value separators contain an unsupported kind.');
      }
      for (const [label, groups] of [['prefix', current.autoPrefixGroups], ['suffix', current.autoSuffixGroups]]) {
        const sourceGroups = label === 'prefix' ? params.autoPrefixGroups : params.autoSuffixGroups;
        if (sourceGroups !== undefined && !Array.isArray(sourceGroups)) {
          errors.push(`Automatic ${label} groups must be an array.`);
        }
        if (groups.length > 8 || groups.some((value) => !/^[A-Za-z0-9]{2,8}$/.test(value))) {
          errors.push(`Automatic ${label} groups must contain at most 8 alphanumeric values of 2 to 8 characters.`);
        }
      }
      if (current.patternMode === PATTERN_MODES.CUSTOM) {
        if (!['KEEP', 'GENERATE'].includes(current.customDefaultAction)) {
          errors.push('Custom pattern default must be KEEP or GENERATE.');
        }
        for (const [direction, partAction, length, replacement] of [
          ['Prefix', current.prefixAction, current.prefixLength, current.prefixReplacement],
          ['Suffix', current.suffixAction, current.suffixLength, current.suffixReplacement],
        ]) {
          if (!Object.values(PATTERN_PART_ACTIONS).includes(partAction)) {
            errors.push(`${direction} action must be DEFAULT, KEEP, GENERATE, or REPLACE.`);
          }
          if (!Number.isInteger(length) || length < 0 || length > 256) {
            errors.push(`${direction} length must be an integer from 0 to 256.`);
          }
          if (partAction !== PATTERN_PART_ACTIONS.DEFAULT && length === 0) {
            errors.push(`${direction} length is required when its action is not DEFAULT.`);
          }
          if (partAction === PATTERN_PART_ACTIONS.REPLACE && replacement.length === 0) {
            errors.push(`${direction} replacement text is required.`);
          }
        }
        if (params.segmentRules !== undefined && !Array.isArray(params.segmentRules)) {
          errors.push('Segment rules must be an array.');
        }
        if (current.segmentRules.length > 16) errors.push('At most 16 custom segment rules are allowed.');
        const indexes = new Set();
        for (const rule of current.segmentRules) {
          if (!Number.isInteger(rule.segmentIndex) || rule.segmentIndex < 0 || rule.segmentIndex > 255) {
            errors.push('Segment indexes must be integers from 0 to 255.');
          }
          if (indexes.has(rule.segmentIndex)) errors.push(`Segment ${rule.segmentIndex + 1} has more than one rule.`);
          indexes.add(rule.segmentIndex);
          if (!Object.values(PATTERN_PART_ACTIONS).includes(rule.action)) {
            errors.push('Segment action must be DEFAULT, KEEP, GENERATE, or REPLACE.');
          }
          if (rule.action === PATTERN_PART_ACTIONS.REPLACE && rule.replacement.length === 0) {
            errors.push(`Segment ${rule.segmentIndex + 1} replacement text is required.`);
          }
        }
      }
    }
    if (action === 'GENERALISE' && !['LOW', 'MEDIUM', 'HIGH'].includes(current.level)) {
      errors.push('Generalisation level must be LOW, MEDIUM, or HIGH.');
    }
    if (action === 'GENERALISE' && !GENERALISATION_STRATEGY_VALUES.includes(current.strategy)) {
      errors.push('Generalisation strategy is not supported.');
    }
    if (action === 'TEXT_SANITISE' && !['CLEAR', 'BLOCK'].includes(current.uncertainValue)) {
      errors.push('Uncertain text handling must be CLEAR or BLOCK.');
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }
  const current = normaliseActionParams({ action, detectedType, params });
  if (!Object.values(SHIFT_KINDS).includes(current.shiftKind)) errors.push('SHIFT requires a supported shift kind.');
  if (!Object.values(OFFSET_MODES).includes(current.offsetMode)) errors.push('SHIFT requires a supported offset mode.');
  if (current.offsetMode === OFFSET_MODES.FIXED) {
    if (!isIntegerText(current.offsetValue)) errors.push('SHIFT requires an explicit integer offset.');
    else if (BigInt(current.offsetValue) === 0n) errors.push('SHIFT offset must not be zero.');
  }
  if (current.offsetMode === OFFSET_MODES.RANDOM_ONCE) {
    if (!isIntegerText(current.rangeMinimum) || !isIntegerText(current.rangeMaximum)) {
      errors.push('Random-once SHIFT requires integer minimum and maximum values.');
    } else if (BigInt(current.rangeMinimum) > BigInt(current.rangeMaximum)) {
      errors.push('Random-once SHIFT minimum must not exceed maximum.');
    } else if (BigInt(current.rangeMinimum) === 0n && BigInt(current.rangeMaximum) === 0n) {
      errors.push('Random-once SHIFT range must contain a non-zero offset.');
    }
  }
  const allowedUnits = current.shiftKind === SHIFT_KINDS.NUMBER_SEQUENCE
    ? [SHIFT_UNITS.INTEGER]
    : detectedType === 'TIME'
      ? [SHIFT_UNITS.HOURS, SHIFT_UNITS.MINUTES]
      : detectedType === 'DATETIME'
        ? [SHIFT_UNITS.DAYS, SHIFT_UNITS.HOURS, SHIFT_UNITS.MINUTES]
      : [SHIFT_UNITS.DAYS];
  if (!allowedUnits.includes(current.unit)) errors.push('SHIFT unit does not match the selected shift kind.');
  if (!Number.isInteger(current.segmentIndex) || current.segmentIndex < 0) errors.push('Numeric segment index must be a non-negative integer.');
  if (detectedType === 'AMBIGUOUS_DATE' && !['DMY', 'MDY'].includes(current.dateOrientation)) {
    errors.push('Ambiguous date SHIFT requires an explicit DD/MM or MM/DD orientation.');
  }
  if (current.dateOrientation !== null && !['DMY', 'MDY', 'YMD'].includes(current.dateOrientation)) {
    errors.push('Date orientation must be DMY, MDY, YMD, or null.');
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
import { GENERALISATION_STRATEGY_VALUES } from '../generation/generalisation-rules.js';
