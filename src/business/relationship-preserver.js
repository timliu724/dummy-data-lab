import { relationshipIsActive } from '../core/contracts.js';

function numericValue(value) {
  const source = String(value ?? '').trim();
  if (!source) return null;
  const negative = /^\(.*\)$/.test(source);
  const cleaned = source.replace(/[,$£€¥%()\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : null;
}

function formatLike(value, sample) {
  const text = String(sample ?? '');
  const decimalPlaces = text.match(/\.(\d+)/)?.[1]?.length ?? 0;
  const absolute = Math.abs(value).toFixed(decimalPlaces);
  const signed = value < 0 ? `-${absolute}` : absolute;
  if (/^\(.*\)$/.test(text) && value < 0) return `(${absolute})`;
  const currency = text.match(/^\s*([$£€¥])/u)?.[1] ?? '';
  const percent = /%\s*$/.test(text) ? '%' : '';
  return `${currency}${signed}${percent}`;
}

function booleanValue(value) {
  const token = String(value ?? '').trim().toLocaleLowerCase();
  if (['true', 'yes', 'y', '1', 'on', 'available', 'in stock'].includes(token)) return true;
  if (['false', 'no', 'n', '0', 'off', 'unavailable', 'out of stock'].includes(token)) return false;
  return null;
}

export class BusinessRelationshipPreserver {
  constructor({ rules = [] } = {}) {
    this.candidateRuleCount = rules.filter((rule) => rule?.status === 'CANDIDATE').length;
    this.rules = Object.freeze(rules
      .filter((rule) => relationshipIsActive(rule))
      .map((rule) => Object.freeze({ ...rule, ...rule.options, kind: rule.kind, id: rule.id })));
    this.appliedCellCount = 0;
    this.skippedRuleCount = 0;
  }

  applyToRow({ outputHeaders, transformedRow }) {
    const outputIndex = new Map(outputHeaders.map((header, index) => [header, index]));
    const row = [...transformedRow];
    for (const rule of this.rules) {
      const sourceIndex = outputIndex.get(rule.sourceColumnName);
      const targetIndex = outputIndex.get(rule.targetColumnName);
      if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) {
        this.skippedRuleCount += 1;
        continue;
      }
      if (rule.kind === 'NUMERIC_EQUAL') {
        row[targetIndex] = row[sourceIndex];
        this.appliedCellCount += 1;
        continue;
      }
      if (rule.kind === 'POSITIVE_FROM_BOOLEAN') {
        const sourceBoolean = booleanValue(row[sourceIndex]);
        const targetNumeric = numericValue(row[targetIndex]);
        if (sourceBoolean === null || targetNumeric === null) {
          this.skippedRuleCount += 1;
          continue;
        }
        const adjusted = sourceBoolean
          ? targetNumeric > 0 ? targetNumeric : Math.max(1, Math.abs(targetNumeric))
          : targetNumeric <= 0 ? targetNumeric : 0;
        row[targetIndex] = formatLike(adjusted, row[targetIndex]);
        this.appliedCellCount += 1;
        continue;
      }
      const sourceNumeric = numericValue(row[sourceIndex]);
      if (sourceNumeric === null) {
        this.skippedRuleCount += 1;
        continue;
      }
      if (rule.kind === 'NUMERIC_DIFFERENCE') {
        row[targetIndex] = formatLike(sourceNumeric + rule.value, row[targetIndex]);
        this.appliedCellCount += 1;
      } else if (rule.kind === 'NUMERIC_RATIO') {
        row[targetIndex] = formatLike(sourceNumeric * rule.value, row[targetIndex]);
        this.appliedCellCount += 1;
      } else if (rule.kind === 'BOOLEAN_FROM_POSITIVE') {
        row[targetIndex] = sourceNumeric > 0 ? rule.trueValue : rule.falseValue;
        this.appliedCellCount += 1;
      }
    }
    return Object.freeze({ row: Object.freeze(row), warnings: Object.freeze([]) });
  }

  statistics() {
    return Object.freeze({
      confirmedRuleCount: this.rules.length,
      detectedRuleCount: this.rules.length,
      candidateRuleCount: this.candidateRuleCount,
      appliedCellCount: this.appliedCellCount,
      skippedRuleCount: this.skippedRuleCount,
    });
  }

  resetStatistics() {
    this.appliedCellCount = 0;
    this.skippedRuleCount = 0;
  }
}
