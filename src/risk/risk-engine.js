import { createRiskAssessment } from '../core/contracts.js';
import { evaluateRiskRules } from './risk-rules.js';

const RISK_ORDER = Object.freeze({ UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 });

/** @param {object} values */
export function assessColumnRisk({ profile, detection, context = {} }) {
  if (!profile || !detection) throw new TypeError('profile and detection are required.');
  const matchedRules = evaluateRiskRules({ profile, detection, context });
  const level = matchedRules.length === 0
    ? 'UNKNOWN'
    : matchedRules.reduce(
        (highest, rule) => RISK_ORDER[rule.level] > RISK_ORDER[highest] ? rule.level : highest,
        'UNKNOWN',
      );
  return createRiskAssessment({
    level,
    reasons: matchedRules.map((rule) => rule.reason),
    evidence: matchedRules.flatMap((rule) => rule.evidence),
    matchedRuleIds: matchedRules.map((rule) => rule.id),
    warnings: [],
    reviewRequired: level === 'HIGH' || matchedRules.some((rule) => rule.reviewRequired),
  });
}

/** @param {object} values */
export function assessTableRisk({ tableProfile, detections }) {
  if (!tableProfile || !Array.isArray(detections)) {
    throw new TypeError('tableProfile and detections are required.');
  }
  if (detections.length !== tableProfile.columns.length) {
    throw new RangeError('detections must align with profiled columns.');
  }
  const dateColumnCount = detections.filter((detection) => ['DATE', 'DATETIME'].includes(detection.type)).length;
  const columns = tableProfile.columns.map((profile, index) => Object.freeze({
    columnIndex: index,
    columnName: profile.columnName,
    assessment: assessColumnRisk({
      profile,
      detection: detections[index],
      context: { dateColumnCount },
    }),
  }));
  return Object.freeze({
    dateColumnCount,
    columns: Object.freeze(columns),
    highestRiskLevel: columns.reduce(
      (highest, column) => RISK_ORDER[column.assessment.level] > RISK_ORDER[highest]
        ? column.assessment.level
        : highest,
      'UNKNOWN',
    ),
  });
}
