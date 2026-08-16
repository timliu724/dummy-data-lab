export const RISK_RULE_IDS = Object.freeze({
  DIRECT_IDENTIFIER: 'DIRECT_IDENTIFIER',
  INDIRECT_IDENTIFIER: 'INDIRECT_IDENTIFIER',
  HIGH_UNIQUENESS_BUSINESS_ID: 'HIGH_UNIQUENESS_BUSINESS_ID',
  FREE_TEXT_DISCLOSURE: 'FREE_TEXT_DISCLOSURE',
  RARE_CATEGORY: 'RARE_CATEGORY',
  NUMERIC_OUTLIER: 'NUMERIC_OUTLIER',
  DATE_COMBINATION: 'DATE_COMBINATION',
  LOW_RISK_STATISTICAL: 'LOW_RISK_STATISTICAL',
  UNKNOWN_OR_LOW_CONFIDENCE: 'UNKNOWN_OR_LOW_CONFIDENCE',
});

const AU_IDENTIFIER_TYPES = new Set(['AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE']);
const DIRECT_TYPES = new Set(['EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE', ...AU_IDENTIFIER_TYPES]);
const ID_TYPES = new Set(['NUMERIC_ID', 'ALPHANUMERIC_CODE', ...AU_IDENTIFIER_TYPES]);
const LOW_RISK_TYPES = new Set(['EMPTY', 'BOOLEAN', 'INTEGER', 'DECIMAL', 'PERCENTAGE', 'CATEGORY']);

/** @param {string} columnName */
function directNameHint(columnName) {
  const header = normalizeHeader(columnName);
  if (/(^|_)file_name(_|$)/.test(header)) return false;
  return /(^|_)(email|phone|mobile|name|address|passport|ssn|tax_id|licence|license)(_|$)/.test(header);
}

/** @param {object} values */
export function evaluateRiskRules({ profile, detection, context = {} }) {
  const matched = [];
  const add = (id, level, reason, evidence, reviewRequired = false) => {
    matched.push(Object.freeze({
      id,
      level,
      reason,
      evidence: Object.freeze(evidence),
      reviewRequired,
    }));
  };
  const type = detection.type ?? detection.detectedType;
  const columnName = profile.columnName ?? '';

  if (DIRECT_TYPES.has(type) || directNameHint(columnName)) {
    add(
      RISK_RULE_IDS.DIRECT_IDENTIFIER,
      'HIGH',
      'The column may directly identify or contact a person.',
      [`Detected type was ${type}.`, directNameHint(columnName) ? 'The column name contained a direct-identifier hint.' : 'Semantic shape indicated a direct identifier.'],
      true,
    );
  }

  if (ID_TYPES.has(type) && (profile.uniqueRatio ?? 0) >= 0.8) {
    add(
      RISK_RULE_IDS.HIGH_UNIQUENESS_BUSINESS_ID,
      'HIGH',
      'A highly unique business identifier can link dummy rows back to source records.',
      [`Unique ratio was ${(profile.uniqueRatio ?? 0).toFixed(4)} with status ${profile.uniqueCountStatus}.`, `Detected type was ${type}.`],
      true,
    );
  }

  if (['DATE', 'DATETIME', 'AMBIGUOUS_DATE'].includes(type)) {
    add(
      RISK_RULE_IDS.INDIRECT_IDENTIFIER,
      'MEDIUM',
      'Dates can become indirect identifiers when combined with other fields.',
      [`Detected temporal type was ${type}.`],
      type === 'AMBIGUOUS_DATE',
    );
  }

  if (type === 'FREE_TEXT') {
    add(
      RISK_RULE_IDS.FREE_TEXT_DISCLOSURE,
      'HIGH',
      'Free text can contain identifiers or sensitive facts not visible in the column name.',
      [`Maximum observed length was ${profile.lengthStats?.maximum ?? 'unknown'}.`],
      true,
    );
  }

  if (type === 'CATEGORY' && profile.uniqueCountStatus === 'EXACT') {
    const rareEntry = [...(profile.topValues ?? [])].sort((left, right) => left.count - right.count)[0];
    if (rareEntry && rareEntry.count <= Math.max(2, Math.floor(profile.nonEmptyCount * 0.01))) {
      add(
        RISK_RULE_IDS.RARE_CATEGORY,
        'MEDIUM',
        'A rare category may be identifying even when the category label is not directly identifying.',
        [`The least frequent bounded category count was ${rareEntry.count} of ${profile.nonEmptyCount}.`],
        true,
      );
    }
  }

  const numeric = profile.numericStats;
  if (numeric?.median !== null && numeric?.median !== undefined) {
    const scale = Math.max(Math.abs(numeric.median), Math.abs(numeric.average ?? 0), 1);
    const extreme = Math.max(Math.abs(numeric.minimum ?? 0), Math.abs(numeric.maximum ?? 0));
    if (extreme > scale * 100) {
      add(
        RISK_RULE_IDS.NUMERIC_OUTLIER,
        'MEDIUM',
        'An extreme numeric boundary may correspond to a rare or special source record.',
        [`Extreme magnitude ${extreme} exceeded the central scale ${scale} by more than 100 times.`],
        true,
      );
    }
  }

  if (['DATE', 'DATETIME'].includes(type) && (context.dateColumnCount ?? 0) >= 2) {
    add(
      RISK_RULE_IDS.DATE_COMBINATION,
      'MEDIUM',
      'Multiple date columns can form a more identifying combination.',
      [`The table contained ${context.dateColumnCount} detected date or date-time columns.`],
      true,
    );
  }

  if (detection.confidence === 'LOW' || detection.reviewRequired || type === 'UNKNOWN') {
    add(
      RISK_RULE_IDS.UNKNOWN_OR_LOW_CONFIDENCE,
      'MEDIUM',
      'Low-confidence or unknown fields require review before source values can be retained.',
      [`Detection confidence was ${detection.confidence}; detected type was ${type}.`],
      true,
    );
  }

  if (LOW_RISK_TYPES.has(type) && matched.length === 0) {
    add(
      RISK_RULE_IDS.LOW_RISK_STATISTICAL,
      'LOW',
      'The field appears to be a low-risk category, flag, or statistical value.',
      [`Detected type was ${type}.`, `Unique ratio was ${(profile.uniqueRatio ?? 0).toFixed(4)}.`],
      false,
    );
  }

  return Object.freeze(matched);
}
import { normalizeHeader } from '../detection/header-normalization.js';
