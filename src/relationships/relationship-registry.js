import { createContractWarning, relationshipIsActive } from '../core/contracts.js';
import { validateActionParams } from '../policy/action-parameters.js';
import { applyCodeDescription, CodeDescriptionContext } from './code-description.js';

const MAPPING_KINDS = new Set(['SAME_ID', 'COLUMN_GROUP', 'MAPPING_RULE']);
const CODE_KINDS = new Set(['CODE_DESCRIPTION', 'CATEGORY_CODE_NAME']);
const SHIFT_GROUP_KINDS = new Set(['DATE_TIME_SHIFT_GROUP', 'NUMBER_SEQUENCE_SHIFT_GROUP']);

function rulesConflict(left, right) {
  const overlap = left.columnNames.some((name) => right.columnNames.includes(name));
  if (!overlap) return false;
  if ((left.kind === 'DATE_ORDER' && right.kind === 'DATE_TIME_SHIFT_GROUP')
    || (right.kind === 'DATE_ORDER' && left.kind === 'DATE_TIME_SHIFT_GROUP')) return false;
  if (left.kind === right.kind && left.mappingScope && left.mappingScope === right.mappingScope) return false;
  return left.kind !== right.kind || left.columnNames.join('|') !== right.columnNames.join('|');
}

export class RelationshipRegistry {
  constructor({ rules = [] } = {}) {
    this.rules = [];
    this.conflicts = [];
    this.codeDescriptionContext = new CodeDescriptionContext();
    for (const rule of rules.filter((candidate) => relationshipIsActive(candidate))) {
      if (SHIFT_GROUP_KINDS.has(rule.kind)) {
        const validation = validateActionParams({
          action: 'SHIFT',
          detectedType: rule.kind === 'DATE_TIME_SHIFT_GROUP' ? (rule.options.unit === 'DAYS' ? 'DATE' : 'TIME') : 'NUMERIC_ID',
          params: rule.options,
        });
        if (!validation.valid) throw new RangeError(`Shift group ${rule.id} is invalid: ${validation.errors.join(' ')}`);
      }
      const conflict = this.rules.find((existing) => rulesConflict(existing, rule));
      if (conflict) {
        this.conflicts.push(Object.freeze({ ruleId: rule.id, conflictingRuleId: conflict.id }));
      } else {
        this.rules.push(rule);
      }
    }
  }

  mappingScopeFor(columnName) {
    const rule = this.rules.find((candidate) => MAPPING_KINDS.has(candidate.kind) && candidate.columnNames.includes(columnName));
    return rule ? rule.mappingScope ?? `relationship:${rule.id}` : null;
  }

  dateScopeFor(columnName) {
    const rule = this.rules.find((candidate) => candidate.kind === 'DATE_ORDER' && candidate.columnNames.includes(columnName));
    return rule ? `date-relationship:${rule.id}` : null;
  }

  shiftConfigurationFor(columnName, shiftKind) {
    const expectedKind = shiftKind === 'NUMBER_SEQUENCE' ? 'NUMBER_SEQUENCE_SHIFT_GROUP' : 'DATE_TIME_SHIFT_GROUP';
    const rule = this.rules.find((candidate) => candidate.kind === expectedKind && candidate.columnNames.includes(columnName));
    return rule ? Object.freeze({ id: rule.id, options: rule.options }) : null;
  }

  applyToRow({ outputHeaders, transformedRow }) {
    let row = [...transformedRow];
    const warnings = [];
    for (const rule of this.rules) {
      if (CODE_KINDS.has(rule.kind)) {
        row = applyCodeDescription({ row, headers: outputHeaders, rule, context: this.codeDescriptionContext });
      }
    }
    return Object.freeze({ row: Object.freeze(row), warnings: Object.freeze(warnings) });
  }

  warnings() {
    return Object.freeze(this.conflicts.map((conflict) => createContractWarning(
      'RELATIONSHIP_CONFLICT',
      'A conflicting relationship rule was not enabled for generation.',
      conflict,
    )));
  }

  statistics() {
    return Object.freeze({
      activeRuleCount: this.rules.length,
      conflictCount: this.conflicts.length,
      codeDescriptions: this.codeDescriptionContext.statistics(),
    });
  }
}
