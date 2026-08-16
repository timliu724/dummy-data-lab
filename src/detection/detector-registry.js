import { createDetectionEvidence } from '../core/contracts.js';
import { detectAlphanumericPattern } from './alphanumeric-pattern.js';
import { detectAustralianIdentifier } from './au-identifier-recognizers.js';
import { detectBasicType } from './basic-types.js';
import { detectCategoryOrBoolean } from './category-boolean.js';
import { detectDateTime } from './date-time.js';
import { detectNumericPattern } from './numeric-pattern.js';
import { analyseValuePatterns } from './pattern-utils.js';
import { detectSemanticHints } from './semantic-hints.js';

export const DETECTED_TYPES = Object.freeze({
  EMPTY: 'EMPTY',
  INTEGER: 'INTEGER',
  DECIMAL: 'DECIMAL',
  PERCENTAGE: 'PERCENTAGE',
  CURRENCY_LIKE: 'CURRENCY_LIKE',
  NUMERIC_ID: 'NUMERIC_ID',
  DATE: 'DATE',
  AMBIGUOUS_DATE: 'AMBIGUOUS_DATE',
  TIME: 'TIME',
  DATETIME: 'DATETIME',
  CATEGORY: 'CATEGORY',
  BOOLEAN: 'BOOLEAN',
  EMAIL: 'EMAIL',
  PHONE_LIKE: 'PHONE_LIKE',
  NAME_LIKE: 'NAME_LIKE',
  ADDRESS_LIKE: 'ADDRESS_LIKE',
  ALPHANUMERIC_CODE: 'ALPHANUMERIC_CODE',
  GENERAL_TEXT: 'GENERAL_TEXT',
  FREE_TEXT: 'FREE_TEXT',
  UNKNOWN: 'UNKNOWN',
  AU_ABN: 'AU_ABN',
  AU_ACN: 'AU_ACN',
  AU_TFN: 'AU_TFN',
  AU_MEDICARE: 'AU_MEDICARE',
});

export class DetectorRegistry {
  constructor() {
    this.detectors = [];
  }

  /** @param {(profile: object, context: object) => object|null} detector */
  register(detector) {
    if (typeof detector !== 'function') throw new TypeError('detector must be a function.');
    this.detectors.push(detector);
    return this;
  }

  /** @param {import('../core/contracts.js').ColumnProfile} profile */
  detect(profile, options = {}) {
    const pattern = analyseValuePatterns(profile);
    const context = Object.freeze({ pattern });
    const candidates = this.detectors
      .map((detector) => detector(profile, Object.freeze({ ...context, ...options })))
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);
    const selected = candidates[0] ?? Object.freeze({
      detector: 'detector-registry',
      type: DETECTED_TYPES.UNKNOWN,
      score: 0,
      confidence: 'LOW',
      evidence: Object.freeze(['No registered detector had sufficient bounded evidence.']),
      warnings: Object.freeze([]),
      reviewRequired: true,
      details: Object.freeze({}),
    });

    return createDetectionEvidence({
      detector: selected.detector,
      detectedType: selected.type,
      confidence: selected.confidence,
      evidence: selected.evidence,
      warnings: selected.warnings,
      reviewRequired: selected.reviewRequired,
      sampleSize: pattern.sampleSize,
      details: Object.freeze({
        ...selected.details,
        pattern,
        candidateTypes: Object.freeze(candidates.map((candidate) => Object.freeze({
          type: candidate.type,
          detector: candidate.detector,
          score: candidate.score,
          confidence: candidate.confidence,
        }))),
      }),
    });
  }
}

export function createDefaultDetectorRegistry() {
  return new DetectorRegistry()
    .register(detectAustralianIdentifier)
    .register(detectBasicType)
    .register(detectDateTime)
    .register(detectCategoryOrBoolean)
    .register(detectSemanticHints)
    .register(detectNumericPattern)
    .register(detectAlphanumericPattern);
}

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectColumn(profile, options = {}) {
  return createDefaultDetectorRegistry().detect(profile, options);
}
