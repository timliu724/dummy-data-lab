import { createInputSource, INPUT_SOURCE_KINDS } from '../core/contracts.js';

export const PARSE_CONTRACT_VERSION = 1;
export const DEFAULT_SAMPLE_BYTES = 64 * 1024;
export const DEFAULT_HEADER_SAMPLE_ROWS = 12;
export const DEFAULT_CALLBACK_CHUNK_ROWS = 1000;

export const HEADER_MODES = Object.freeze({
  AUTO: 'auto',
  YES: 'yes',
  NO: 'no',
});

export const HEADER_MODE_VALUES = Object.freeze(Object.values(HEADER_MODES));

/**
 * @typedef {Object} InputWarning
 * @property {string} code
 * @property {string} message
 * @property {Readonly<Record<string, unknown>>} details
 */

/**
 * One unified input contract for strings, pasted text, and browser File/Blob.
 * Blob payloads remain Blob-backed so a browser parser can read them in chunks.
 *
 * @typedef {Object} AdaptedDelimitedInput
 * @property {number} contractVersion
 * @property {import('../core/contracts.js').InputSource} source
 * @property {string|Blob} payload
 * @property {string} sampleText A bounded decoded prefix used for detection.
 * @property {'unicode'|'utf-8'|'utf-16le'} encoding
 * @property {'UTF-8'|'UTF-16LE'|null} bom
 * @property {readonly InputWarning[]} warnings
 * @property {boolean} supportsIncrementalRead
 */

/**
 * @typedef {Object} DelimitedParseResult
 * @property {import('../core/contracts.js').InputSource} source
 * @property {Readonly<Record<string, unknown>>} delimiterDetection
 * @property {Readonly<Record<string, unknown>>} headerDetection
 * @property {readonly string[]} headers
 * @property {readonly (readonly string[])[]} rows
 * @property {number} rowCount Parsed data rows, excluding an applied header.
 * @property {number} sourceRowCount Parsed logical rows, including a header.
 * @property {readonly import('../core/contracts.js').ParseIssue[]} issues
 * @property {Readonly<Record<string, unknown>>} meta
 */

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
export function createInputWarning(code, message, details = {}) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new TypeError('warning code must be a non-empty string.');
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new TypeError('warning message must be a non-empty string.');
  }
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

/**
 * @param {Object} values
 * @param {import('../core/contracts.js').InputSource} values.source
 * @param {string|Blob} values.payload
 * @param {string} values.sampleText
 * @param {'unicode'|'utf-8'|'utf-16le'} values.encoding
 * @param {'UTF-8'|'UTF-16LE'|null} [values.bom]
 * @param {InputWarning[]} [values.warnings]
 * @param {boolean} [values.supportsIncrementalRead]
 * @returns {AdaptedDelimitedInput}
 */
export function createAdaptedDelimitedInput({
  source,
  payload,
  sampleText,
  encoding,
  bom = null,
  warnings = [],
  supportsIncrementalRead = false,
}) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('source is required.');
  }
  if (typeof payload !== 'string' && !isBlobLike(payload)) {
    throw new TypeError('payload must be a string or Blob-like object.');
  }
  if (typeof sampleText !== 'string') {
    throw new TypeError('sampleText must be a string.');
  }
  if (!['unicode', 'utf-8', 'utf-16le'].includes(encoding)) {
    throw new RangeError('encoding must be unicode, utf-8, or utf-16le.');
  }

  return Object.freeze({
    contractVersion: PARSE_CONTRACT_VERSION,
    source,
    payload,
    sampleText,
    encoding,
    bom,
    warnings: Object.freeze([...warnings]),
    supportsIncrementalRead: Boolean(supportsIncrementalRead),
  });
}

/** @param {unknown} value */
export function isAdaptedDelimitedInput(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.contractVersion === PARSE_CONTRACT_VERSION &&
      value.source &&
      typeof value.sampleText === 'string',
  );
}

/** @param {unknown} value */
export function isBlobLike(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.size === 'number' &&
      typeof value.slice === 'function' &&
      typeof value.arrayBuffer === 'function',
  );
}

export { createInputSource, INPUT_SOURCE_KINDS };
