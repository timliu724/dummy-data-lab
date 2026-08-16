import { createInputSource, INPUT_SOURCE_KINDS } from '../core/contracts.js';
import { decodeBlobSample, normalizeUnicodeText } from './encoding.js';
import {
  createAdaptedDelimitedInput,
  DEFAULT_SAMPLE_BYTES,
  isAdaptedDelimitedInput,
  isBlobLike,
} from './parse-contract.js';

let sourceSequence = 0;

/** @param {string} kind */
function validateStringKind(kind) {
  if (![INPUT_SOURCE_KINDS.TEXT, INPUT_SOURCE_KINDS.PASTE].includes(kind)) {
    throw new RangeError('String input kind must be TEXT or PASTE.');
  }
  return kind;
}

/**
 * Converts every supported input into one parsing contract. Only a bounded
 * prefix is decoded for Blob detection; the original Blob remains the payload.
 *
 * @param {string|Blob|import('./parse-contract.js').AdaptedDelimitedInput} input
 * @param {Object} [options]
 * @param {'FILE'|'PASTE'|'TEXT'} [options.kind]
 * @param {string} [options.name]
 * @param {string} [options.id]
 * @param {number} [options.maxSampleBytes]
 * @param {'auto'|'utf-8'|'utf-16le'} [options.encoding]
 */
export async function adaptInput(
  input,
  {
    kind,
    name,
    id,
    maxSampleBytes = DEFAULT_SAMPLE_BYTES,
    encoding = 'auto',
  } = {},
) {
  if (isAdaptedDelimitedInput(input)) return input;
  const sourceId = id ?? `input-${++sourceSequence}`;

  if (typeof input === 'string') {
    const sourceKind = validateStringKind(kind ?? INPUT_SOURCE_KINDS.TEXT);
    const decoded = normalizeUnicodeText(input);
    return createAdaptedDelimitedInput({
      source: createInputSource({
        id: sourceId,
        kind: sourceKind,
        name: name ?? null,
        metadata: { suppliedAs: sourceKind === INPUT_SOURCE_KINDS.PASTE ? 'paste' : 'string' },
      }),
      payload: decoded.text,
      sampleText: decoded.text.slice(0, maxSampleBytes),
      encoding: decoded.encoding,
      bom: decoded.bom,
      warnings: decoded.warnings,
      supportsIncrementalRead: false,
    });
  }

  if (isBlobLike(input)) {
    const decodedSample = await decodeBlobSample(input, {
      maxBytes: maxSampleBytes,
      encoding,
    });
    const fileName = name ?? (typeof input.name === 'string' ? input.name : null);
    return createAdaptedDelimitedInput({
      source: createInputSource({
        id: sourceId,
        kind: INPUT_SOURCE_KINDS.FILE,
        name: fileName,
        sizeBytes: input.size,
        metadata: { suppliedAs: 'blob' },
      }),
      payload: input,
      sampleText: decodedSample.text,
      encoding: decodedSample.encoding,
      bom: decodedSample.bom,
      warnings: decodedSample.warnings,
      supportsIncrementalRead: true,
    });
  }

  throw new TypeError('Input must be a string, browser File/Blob, or adapted input.');
}

/** @param {string} text @param {Omit<Parameters<typeof adaptInput>[1], 'kind'>} [options] */
export function adaptPastedText(text, options = {}) {
  return adaptInput(text, { ...options, kind: INPUT_SOURCE_KINDS.PASTE });
}

/** @param {string} text @param {Omit<Parameters<typeof adaptInput>[1], 'kind'>} [options] */
export function adaptStringInput(text, options = {}) {
  return adaptInput(text, { ...options, kind: INPUT_SOURCE_KINDS.TEXT });
}
