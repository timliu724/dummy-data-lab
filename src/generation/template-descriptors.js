import { valueShape } from '../detection/pattern-utils.js';
import { activeMultiValueTokenization } from '../detection/multi-value-pattern.js';
import { stableFingerprint } from '../profile/value-normalization.js';
import { normaliseActionParams, PATTERN_MODES } from '../policy/action-parameters.js';
import { createAutoPatternMask, createCustomPatternMask } from './pattern-generator.js';
import { generaliseValue } from './generalisation-rules.js';

const DESCRIPTOR_ACTIONS = new Set([
  'REPLACE',
  'PATTERN_REPLACE',
  'GENERALISE',
  'TEXT_SANITISE',
]);

const DESCRIPTOR_PATTERN = /^<DDG\|([A-Z_]+)\|([^|]*)\|([a-f0-9]{16})\|(\d+)(?:\|([^>]*))?>$/;
const LEGACY_INTERNAL_PATTERN = /^<(?:REPLACE|PATTERN|GENERALISE|TEXT_SANITISE):.*>$/s;
const LEGACY_OUTPUT_PATTERN = /^<(?:CATEGORY_GROUP|GENERALISED_[A-Z_]+)>$/;

const NON_CODE_TYPES = new Set(['EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE', 'DATE', 'DATETIME', 'TIME', 'AMBIGUOUS_DATE']);

function codeStructure(value, { detectedType, columnName }) {
  const text = String(value ?? '');
  const shape = valueShape(text);
  if (!text || text.length > 80 || NON_CODE_TYPES.has(detectedType)) return null;
  const semanticHeader = /(?:^|[_\s-])(id|code|no|number|batch|model|sku|serial|ref|reference|job|order|postcode|postal|zip)(?:$|[_\s-])/i.test(columnName);
  const recognisedCode = ['ALPHANUMERIC_CODE', 'NUMERIC_ID'].includes(detectedType);
  const structuralCode = /\p{N}/u.test(text) && (/[._/-]/.test(text) || /\p{Lu}/u.test(text));
  if (!semanticHeader && !recognisedCode && !structuralCode) return null;
  const prefix = text.match(/^([A-Za-z]{1,8})(?=[0-9._/-])/)?.[1] ?? null;
  return Object.freeze({
    kind: 'CODE_STRUCTURE',
    prefix: prefix ? Object.freeze({ shape: valueShape(prefix), identity: stableFingerprint(prefix.toLocaleUpperCase()) }) : null,
    hasLetters: /\p{L}/u.test(text),
    hasDigits: /\p{N}/u.test(text),
    shape,
  });
}

/**
 * Creates a bounded, non-reversible in-memory descriptor for a protected value.
 * The fingerprint preserves distinctions without retaining the raw value.
 */
export function createTemplateDescriptor(action, value, { actionParams = {}, detectedType = 'UNKNOWN', columnName = '' } = {}) {
  if (!DESCRIPTOR_ACTIONS.has(action)) throw new RangeError(`Unsupported descriptor action: ${action}`);
  const text = String(value ?? '');
  if (text === '') return '';
  const shape = encodeURIComponent(valueShape(text));
  const identity = stableFingerprint(text);
  const lengthBucket = Math.max(20, Math.min(10000, Math.ceil(text.length / 20) * 20));
  let payload = '';
  if (action === 'PATTERN_REPLACE') {
    const params = normaliseActionParams({ action, params: actionParams });
    const tokenized = activeMultiValueTokenization(text, params);
    const itemMask = (item) => params.patternMode === PATTERN_MODES.CUSTOM
      ? createCustomPatternMask(item, params)
      : params.patternMode === PATTERN_MODES.AUTO
        ? createAutoPatternMask(item, params)
        : null;
    const mask = tokenized
      ? Object.freeze({
          kind: 'MULTI_VALUE',
          itemCount: tokenized.itemCount,
          parts: Object.freeze(tokenized.parts.map((part) => part.kind === 'SEPARATOR'
            ? Object.freeze({ kind: 'SEPARATOR', value: part.value })
            : Object.freeze({
                kind: 'ITEM',
                shape: part.shape,
                identity: stableFingerprint(part.value),
                patternMask: itemMask(part.value),
              }))),
        })
      : itemMask(text);
    if (mask) payload = `|${encodeURIComponent(JSON.stringify(mask))}`;
  } else if (action === 'GENERALISE') {
    const params = normaliseActionParams({ action, detectedType, params: actionParams });
    const generalized = generaliseValue(text, {
      detectedType,
      columnName,
      strategy: params.strategy,
      level: params.level,
    });
    payload = `|${encodeURIComponent(JSON.stringify({ kind: 'GENERALISED', value: generalized }))}`;
  } else if (action === 'REPLACE') {
    const structure = codeStructure(text, { detectedType, columnName });
    if (structure) payload = `|${encodeURIComponent(JSON.stringify(structure))}`;
  }
  return `<DDG|${action}|${shape}|${identity}|${lengthBucket}${payload}>`;
}

/** @param {unknown} value */
export function parseTemplateDescriptor(value) {
  const match = String(value ?? '').match(DESCRIPTOR_PATTERN);
  if (!match || !DESCRIPTOR_ACTIONS.has(match[1])) return null;
  try {
    const payload = match[5] ? JSON.parse(decodeURIComponent(match[5])) : null;
    return Object.freeze({
      action: match[1],
      shape: decodeURIComponent(match[2]),
      identity: match[3],
      lengthBucket: Number(match[4]),
      patternMask: match[1] === 'PATTERN_REPLACE' ? payload : null,
      generalisedValue: match[1] === 'GENERALISE' && payload?.kind === 'GENERALISED'
        ? String(payload.value ?? '')
        : null,
      codeStructure: match[1] === 'REPLACE' && payload?.kind === 'CODE_STRUCTURE'
        ? Object.freeze({
            ...payload,
            prefix: payload.prefix ? Object.freeze({ ...payload.prefix }) : null,
          })
        : null,
    });
  } catch {
    return null;
  }
}

/** @param {unknown} value */
export function isInternalTemplateMarker(value) {
  const text = String(value ?? '').trim();
  return text.startsWith('<DDG|')
    || DESCRIPTOR_PATTERN.test(text)
    || LEGACY_INTERNAL_PATTERN.test(text)
    || LEGACY_OUTPUT_PATTERN.test(text);
}
