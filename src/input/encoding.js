import { createInputWarning } from './parse-contract.js';

export const BYTE_ENCODINGS = Object.freeze({
  UTF8: 'utf-8',
  UTF16LE: 'utf-16le',
});

/** @param {ArrayBuffer|ArrayBufferView|Uint8Array} input */
function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('Expected an ArrayBuffer or typed array.');
}

/** @param {string} text */
function replacementCharacterCount(text) {
  let count = 0;
  for (const character of text) {
    if (character === '\uFFFD') count += 1;
  }
  return count;
}

/**
 * Detects only the encodings the first version promises to support.
 * BOM-less input defaults to UTF-8.
 *
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} input
 */
export function detectByteEncoding(input) {
  const bytes = toUint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return Object.freeze({ encoding: BYTE_ENCODINGS.UTF8, bom: 'UTF-8', bomLength: 3 });
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Object.freeze({ encoding: BYTE_ENCODINGS.UTF16LE, bom: 'UTF-16LE', bomLength: 2 });
  }
  return Object.freeze({ encoding: BYTE_ENCODINGS.UTF8, bom: null, bomLength: 0 });
}

/**
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} input
 * @param {Object} [options]
 * @param {'auto'|'utf-8'|'utf-16le'} [options.encoding]
 * @param {boolean} [options.allowIncompleteTail]
 */
export function decodeBytes(input, { encoding = 'auto', allowIncompleteTail = false } = {}) {
  const bytes = toUint8Array(input);
  const detected = detectByteEncoding(bytes);
  const selectedEncoding = encoding === 'auto' ? detected.encoding : encoding;
  if (!Object.values(BYTE_ENCODINGS).includes(selectedEncoding)) {
    throw new RangeError('Only UTF-8 and UTF-16LE decoding are supported.');
  }

  const decoder = new TextDecoder(selectedEncoding, { fatal: false, ignoreBOM: false });
  let text = decoder.decode(bytes, { stream: Boolean(allowIncompleteTail) });
  if (text.startsWith('\uFEFF')) text = text.slice(1);

  const replacementCount = replacementCharacterCount(text);
  const warnings = [];
  if (replacementCount > 0) {
    warnings.push(
      createInputWarning(
        'DECODE_REPLACEMENT_CHARACTER',
        'The decoder inserted one or more replacement characters; the source encoding may be incorrect or damaged.',
        { replacementCount, encoding: selectedEncoding },
      ),
    );
  }

  return Object.freeze({
    text,
    encoding: selectedEncoding,
    bom: detected.bom,
    bomLength: detected.bomLength,
    warnings: Object.freeze(warnings),
  });
}

/** @param {string} input */
export function normalizeUnicodeText(input) {
  if (typeof input !== 'string') throw new TypeError('input must be a string.');
  const hadBom = input.startsWith('\uFEFF');
  const text = hadBom ? input.slice(1) : input;
  const replacementCount = replacementCharacterCount(text);
  const warnings = replacementCount
    ? [
        createInputWarning(
          'DECODE_REPLACEMENT_CHARACTER',
          'The supplied text contains one or more Unicode replacement characters.',
          { replacementCount, encoding: 'unicode' },
        ),
      ]
    : [];

  return Object.freeze({
    text,
    encoding: 'unicode',
    bom: hadBom ? 'UTF-8' : null,
    warnings: Object.freeze(warnings),
  });
}

/**
 * Reads only a bounded Blob prefix for encoding and structure detection.
 *
 * @param {Blob} blob
 * @param {Object} [options]
 * @param {number} [options.maxBytes]
 * @param {'auto'|'utf-8'|'utf-16le'} [options.encoding]
 */
export async function decodeBlobSample(blob, { maxBytes = 64 * 1024, encoding = 'auto' } = {}) {
  if (!blob || typeof blob.slice !== 'function' || typeof blob.arrayBuffer !== 'function') {
    throw new TypeError('blob must be Blob-like.');
  }
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive integer.');
  }
  const end = Math.min(blob.size, maxBytes);
  const bytes = await blob.slice(0, end).arrayBuffer();
  return decodeBytes(bytes, {
    encoding,
    allowIncompleteTail: end < blob.size,
  });
}
