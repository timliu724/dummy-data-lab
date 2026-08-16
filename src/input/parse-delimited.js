import Papa from './papa-provider.js';

import { createParseIssue } from '../core/contracts.js';
import { decodeBytes } from './encoding.js';
import { detectDelimiter } from './delimiter-detection.js';
import { detectHeader } from './header-detection.js';
import { adaptInput } from './input-adapter.js';
import {
  DEFAULT_CALLBACK_CHUNK_ROWS,
  DEFAULT_HEADER_SAMPLE_ROWS,
  HEADER_MODES,
  HEADER_MODE_VALUES,
  isBlobLike,
} from './parse-contract.js';

/** @param {readonly string[]} row */
function isEmptyLogicalRow(row) {
  return row.length === 1 && row[0] === '';
}

/** @param {readonly {row: readonly string[]}[]} entries */
function modalRowWidth(entries) {
  const counts = new Map();
  let bestWidth = 0;
  let bestFrequency = 0;
  for (const { row } of entries) {
    if (isEmptyLogicalRow(row)) continue;
    const frequency = (counts.get(row.length) ?? 0) + 1;
    counts.set(row.length, frequency);
    if (frequency > bestFrequency || (frequency === bestFrequency && row.length > bestWidth)) {
      bestWidth = row.length;
      bestFrequency = frequency;
    }
  }
  return bestWidth;
}

/** @param {unknown} result @param {string} callbackName */
function validateCallbackResult(result, callbackName) {
  if (result && typeof result.then === 'function') {
    throw new TypeError(`${callbackName} must be synchronous in this parser version.`);
  }
  return result;
}

/** @param {Object} error */
function mapPapaIssue(error) {
  const rowIndex = Number.isInteger(error.row) && error.row >= 0 ? error.row : null;
  const position = Number.isInteger(error.index) && error.index >= 0 ? error.index : null;
  return createParseIssue({
    code: error.code ?? 'PAPA_PARSE_ERROR',
    type: error.type ?? 'PARSE',
    message: error.message ?? 'Papa Parse reported an unspecified parsing error.',
    severity: error.code === 'MissingQuotes' || error.type === 'Quotes' ? 'ERROR' : 'WARNING',
    rowIndex,
    position,
    details: {
      parser: 'papaparse',
      parserCode: error.code ?? null,
    },
  });
}

/** @param {Object} warning @param {string} type */
function mapWarningIssue(warning, type) {
  return createParseIssue({
    code: warning.code,
    type,
    message: warning.message,
    severity: 'WARNING',
    details: warning.details ?? {},
  });
}

/**
 * In browsers, Papa Parse can consume File/Blob incrementally. Node does not
 * provide FileReader, so Blob-based unit tests use a whole-Blob decode fallback.
 *
 * @param {import('./parse-contract.js').AdaptedDelimitedInput} input
 */
async function preparePayload(input) {
  if (typeof input.payload === 'string') {
    return { payload: input.payload, warnings: [], browserBlobStreaming: false };
  }
  if (!isBlobLike(input.payload)) throw new TypeError('Unsupported adapted payload.');

  if (typeof FileReader !== 'undefined') {
    return { payload: input.payload, warnings: [], browserBlobStreaming: true };
  }

  const decoded = decodeBytes(await input.payload.arrayBuffer(), {
    encoding: input.encoding === 'unicode' ? 'auto' : input.encoding,
  });
  return { payload: decoded.text, warnings: decoded.warnings, browserBlobStreaming: false };
}

/**
 * Parses strings, pasted text, or browser File/Blob through one contract.
 * Set `collectRows: false` and provide `onRow` or `onChunk` to keep retained
 * parser output bounded while scanning a large input.
 *
 * @param {string|Blob|import('./parse-contract.js').AdaptedDelimitedInput} rawInput
 * @param {Object} [options]
 * @param {'FILE'|'PASTE'|'TEXT'} [options.inputKind]
 * @param {string} [options.name]
 * @param {string} [options.id]
 * @param {'auto'|'utf-8'|'utf-16le'} [options.encoding]
 * @param {string} [options.delimiter] Manual delimiter override.
 * @param {string} [options.customDelimiter] Additional detection candidate.
 * @param {'auto'|'yes'|'no'} [options.header]
 * @param {boolean} [options.autoHeaderFallback] Resolve an ambiguous Auto result from its competing scores, preferring data retention unless Yes evidence is materially stronger.
 * @param {boolean} [options.collectRows]
 * @param {(row: readonly string[], context: Readonly<Record<string, unknown>>) => void|boolean} [options.onRow]
 * @param {(rows: readonly (readonly string[])[], context: Readonly<Record<string, unknown>>) => void|boolean} [options.onChunk]
 * @param {number} [options.callbackChunkRows]
 * @param {number} [options.headerSampleRows]
 * @returns {Promise<import('./parse-contract.js').DelimitedParseResult>}
 */
export async function parseDelimited(
  rawInput,
  {
    inputKind,
    name,
    id,
    encoding = 'auto',
    delimiter,
    customDelimiter,
    header = HEADER_MODES.AUTO,
    autoHeaderFallback = false,
    collectRows = true,
    onRow,
    onChunk,
    callbackChunkRows = DEFAULT_CALLBACK_CHUNK_ROWS,
    headerSampleRows = DEFAULT_HEADER_SAMPLE_ROWS,
  } = {},
) {
  if (!HEADER_MODE_VALUES.includes(header)) {
    throw new RangeError('header must be auto, yes, or no.');
  }
  if (typeof autoHeaderFallback !== 'boolean') {
    throw new TypeError('autoHeaderFallback must be a boolean.');
  }
  if (onRow !== undefined && typeof onRow !== 'function') {
    throw new TypeError('onRow must be a function.');
  }
  if (onChunk !== undefined && typeof onChunk !== 'function') {
    throw new TypeError('onChunk must be a function.');
  }
  if (!Number.isInteger(callbackChunkRows) || callbackChunkRows <= 0) {
    throw new RangeError('callbackChunkRows must be a positive integer.');
  }
  if (!Number.isInteger(headerSampleRows) || headerSampleRows < 2) {
    throw new RangeError('headerSampleRows must be an integer of at least 2.');
  }

  const input = await adaptInput(rawInput, {
    kind: inputKind,
    name,
    id,
    encoding,
  });
  const delimiterDetection = detectDelimiter(input.sampleText, {
    customDelimiter,
    manualDelimiter: delimiter,
  });
  const prepared = await preparePayload(input);

  return new Promise((resolve, reject) => {
    const rows = [];
    const prelude = [];
    const pendingEmptyEntries = [];
    const callbackBuffer = [];
    const issues = [];
    const issueKeys = new Set();
    let headers = [];
    let headerDetection = null;
    let expectedColumnCount = 0;
    let preludeFinalized = false;
    let sourceRowCount = 0;
    let dataRowCount = 0;
    let aborted = false;
    let lastMeta = {};
    let settled = false;

    const addIssue = (issue) => {
      const key = `${issue.code}|${issue.rowIndex}|${issue.columnIndex}|${issue.position}`;
      if (issueKeys.has(key)) return;
      issueKeys.add(key);
      issues.push(issue);
    };

    for (const warning of [...input.warnings, ...prepared.warnings]) {
      addIssue(mapWarningIssue(warning, 'ENCODING'));
    }
    for (const warning of delimiterDetection.warnings) {
      addIssue(mapWarningIssue(warning, 'DELIMITER'));
    }

    const stopParser = (parser) => {
      aborted = true;
      if (parser && typeof parser.abort === 'function') parser.abort();
    };

    const flushCallbackChunk = (parser) => {
      if (!onChunk || callbackBuffer.length === 0) return true;
      const chunk = Object.freeze(callbackBuffer.splice(0).map((row) => Object.freeze([...row])));
      const callbackResult = validateCallbackResult(
        onChunk(chunk, Object.freeze({
          startRowIndex: dataRowCount - chunk.length,
          rowCount: chunk.length,
          delimiter: delimiterDetection.delimiter,
        })),
        'onChunk',
      );
      if (callbackResult === false) {
        stopParser(parser);
        return false;
      }
      return true;
    };

    const emitRow = (entry, parser) => {
      const row = Object.freeze(entry.row.map((value) => String(value ?? '')));
      if (!isEmptyLogicalRow(row) && expectedColumnCount > 0 && row.length !== expectedColumnCount) {
        addIssue(createParseIssue({
          code: 'FIELD_COUNT_MISMATCH',
          type: 'FIELD_MISMATCH',
          message: `Expected ${expectedColumnCount} fields but parsed ${row.length}.`,
          severity: 'WARNING',
          rowIndex: entry.sourceRowIndex,
          columnIndex: row.length < expectedColumnCount ? row.length : expectedColumnCount,
          details: { expectedFieldCount: expectedColumnCount, actualFieldCount: row.length },
        }));
      }
      if (row.some((value) => value.includes('\uFFFD'))) {
        addIssue(createParseIssue({
          code: 'DECODE_REPLACEMENT_CHARACTER',
          type: 'ENCODING',
          message: 'A parsed field contains a Unicode replacement character.',
          severity: 'WARNING',
          rowIndex: entry.sourceRowIndex,
        }));
      }

      const dataRowIndex = dataRowCount;
      if (collectRows) rows.push(row);
      dataRowCount += 1;

      if (onRow) {
        const callbackResult = validateCallbackResult(
          onRow(row, Object.freeze({
            rowIndex: dataRowIndex,
            sourceRowIndex: entry.sourceRowIndex,
            delimiter: delimiterDetection.delimiter,
          })),
          'onRow',
        );
        if (callbackResult === false) {
          stopParser(parser);
          return false;
        }
      }

      if (onChunk) {
        callbackBuffer.push(row);
        if (callbackBuffer.length >= callbackChunkRows) return flushCallbackChunk(parser);
      }
      return true;
    };

    const acceptEntry = (entry, parser) => {
      if (!preludeFinalized) {
        prelude.push(entry);
        if (prelude.length >= headerSampleRows) return finalizePrelude(parser);
        return true;
      }
      return emitRow(entry, parser);
    };

    const flushPendingEmptyEntries = (parser) => {
      while (pendingEmptyEntries.length > 0) {
        if (!acceptEntry(pendingEmptyEntries.shift(), parser)) return false;
      }
      return true;
    };

    const finalizePrelude = (parser) => {
      if (preludeFinalized) return true;
      preludeFinalized = true;
      const sampleRows = prelude.map((entry) => entry.row);
      const detected = header === HEADER_MODES.AUTO
        ? detectHeader(sampleRows)
        : Object.freeze({
            decision: header,
            confidence: 'HIGH',
            yesScore: header === HEADER_MODES.YES ? 1 : 0,
            noScore: header === HEADER_MODES.NO ? 1 : 0,
            evidence: Object.freeze([`The user manually selected header=${header}.`]),
            warnings: Object.freeze([]),
          });
      const useAutomaticFallback = header === HEADER_MODES.AUTO
        && autoHeaderFallback
        && detected.decision === 'ambiguous'
        && sampleRows.length >= 2;
      const automaticDecision = detected.yesScore - detected.noScore >= 0.1 ? 'yes' : 'no';
      const resolved = useAutomaticFallback
        ? Object.freeze({
            ...detected,
            decision: automaticDecision,
            confidence: 'LOW',
            detectedDecision: 'ambiguous',
            autoFallback: true,
            evidence: Object.freeze([
              ...detected.evidence,
              automaticDecision === 'yes'
                ? 'Auto mode used the first logical row as headers because the Yes score was materially stronger.'
                : 'Auto mode retained the first logical row as data because the Yes score was not materially stronger.',
            ]),
            warnings: Object.freeze([]),
          })
        : detected;
      const applied = resolved.decision === 'yes';
      headerDetection = Object.freeze({
        ...resolved,
        applied,
        overridden: header !== HEADER_MODES.AUTO,
      });
      for (const warning of resolved.warnings) {
        addIssue(mapWarningIssue(warning, 'HEADER'));
      }

      const dataEntries = [...prelude];
      if (applied && dataEntries.length > 0) {
        headers = Object.freeze([...dataEntries.shift().row]);
      }
      expectedColumnCount = headers.length || modalRowWidth(dataEntries);

      for (const entry of dataEntries) {
        if (!emitRow(entry, parser)) return false;
      }
      prelude.length = 0;
      return true;
    };

    const buildResult = () => Object.freeze({
      source: input.source,
      delimiterDetection,
      headerDetection: headerDetection ?? Object.freeze({
        decision: 'ambiguous',
        confidence: 'LOW',
        applied: false,
        overridden: false,
        evidence: Object.freeze(['No logical rows were available.']),
        warnings: Object.freeze([]),
      }),
      headers: Object.freeze([...headers]),
      rows: Object.freeze(rows.map((row) => Object.freeze([...row]))),
      rowCount: dataRowCount,
      sourceRowCount,
      issues: Object.freeze([...issues]),
      meta: Object.freeze({
        delimiter: delimiterDetection.delimiter,
        linebreak: lastMeta.linebreak ?? delimiterDetection.linebreak ?? null,
        encoding: input.encoding,
        bom: input.bom,
        aborted: Boolean(aborted || lastMeta.aborted),
        collectRows: Boolean(collectRows),
        inputSupportsIncrementalRead: input.supportsIncrementalRead,
        browserBlobStreaming: prepared.browserBlobStreaming,
      }),
    });

    const finish = (parser) => {
      if (settled) return;
      try {
        finalizePrelude(parser);
        flushCallbackChunk(parser);
        settled = true;
        resolve(buildResult());
      } catch (error) {
        settled = true;
        reject(error);
      }
    };

    try {
      Papa.parse(prepared.payload, {
        delimiter: delimiterDetection.delimiter,
        header: false,
        dynamicTyping: false,
        skipEmptyLines: false,
        quoteChar: '"',
        escapeChar: '"',
        encoding: input.encoding === 'unicode' ? undefined : input.encoding,
        step(parseStep, parser) {
          if (settled) return;
          try {
            lastMeta = parseStep.meta ?? lastMeta;
            for (const error of parseStep.errors ?? []) addIssue(mapPapaIssue(error));
            const row = Object.freeze((parseStep.data ?? []).map((value) => String(value ?? '')));
            const entry = Object.freeze({ row, sourceRowIndex: sourceRowCount });
            sourceRowCount += 1;

            // Keep intentional interior blank rows, but do not turn a final
            // line ending into an extra empty data row.
            if (isEmptyLogicalRow(row)) {
              pendingEmptyEntries.push(entry);
            } else {
              flushPendingEmptyEntries(parser);
              acceptEntry(entry, parser);
            }
          } catch (error) {
            settled = true;
            if (parser && typeof parser.abort === 'function') parser.abort();
            reject(error);
          }
        },
        complete(results) {
          lastMeta = results?.meta ?? lastMeta;
          for (const error of results?.errors ?? []) addIssue(mapPapaIssue(error));
          finish(null);
        },
        error(error) {
          addIssue(createParseIssue({
            code: 'INPUT_READ_ERROR',
            type: 'IO',
            message: error?.message ?? 'The input could not be read.',
            severity: 'ERROR',
          }));
          finish(null);
        },
      });
    } catch (error) {
      settled = true;
      reject(error);
    }
  });
}
