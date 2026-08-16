import { RelationshipRegistry } from '../relationships/relationship-registry.js';
import { BasicProvider } from './basic-provider.js';
import { DateShiftContext } from './date-shift-context.js';
import { MappingContext } from './mapping-context.js';
import { SeededRandomSource } from './random-source.js';
import { ACTION_EXECUTORS } from './transform-row.js';
import { createTemplateDescriptor } from './template-descriptors.js';
import { businessFidelityModel } from '../business/fidelity.js';

const DEFAULT_EXAMPLE_LIMIT = 2;

function boundedSamples(profile, limit) {
  const values = Array.isArray(profile?.sampleValues) ? profile.sampleValues : [];
  return values.slice(0, limit);
}

function previewValue(result) {
  if (result.dropped) return '(column removed)';
  if (result.value === null || result.value === undefined || String(result.value) === '') return '(blank)';
  return String(result.value);
}

/**
 * Builds a small, deterministic illustration of the current Final Actions.
 * It uses only the already-bounded profile samples and never scans source rows.
 * The preview mapping is separate from final generation, so it is informative
 * rather than a promise that the final random values will be identical.
 */
export function buildActionPreviews({
  headers,
  policies,
  profiles = [],
  detections = [],
  relationshipRules = [],
  businessFidelity = 'BALANCED',
  businessFidelitySettings = null,
  maxExamples = DEFAULT_EXAMPLE_LIMIT,
  seed = 0x50_33_56,
}) {
  if (!Array.isArray(headers) || !Array.isArray(policies)) throw new TypeError('headers and policies are required.');
  if (!Number.isInteger(maxExamples) || maxExamples < 1 || maxExamples > 3) {
    throw new RangeError('Action preview maxExamples must be an integer from 1 to 3.');
  }
  const fidelity = businessFidelityModel(businessFidelity, businessFidelitySettings);
  // Keep the same random stream across modes. A preview should change only
  // when a fidelity setting changes the real rule, never merely because the
  // selected card supplied a different decorative seed.
  const random = new SeededRandomSource(seed >>> 0);
  const mappingContext = new MappingContext();
  const basicProvider = new BasicProvider({ random });
  const dateShiftContext = new DateShiftContext({ random });
  const relationshipRegistry = new RelationshipRegistry({ rules: relationshipRules });

  return Object.freeze(policies.map((policy, columnIndex) => {
    const executor = ACTION_EXECUTORS[policy.selectedAction];
    const samples = boundedSamples(profiles[columnIndex], maxExamples);
    if (!executor) {
      return Object.freeze({
        columnIndex,
        columnName: policy.columnName,
        action: policy.selectedAction,
        status: 'ERROR',
        message: `Unsupported action ${policy.selectedAction}.`,
        examples: Object.freeze([]),
      });
    }
    if (samples.length === 0) {
      return Object.freeze({
        columnIndex,
        columnName: policy.columnName,
        action: policy.selectedAction,
        status: 'EMPTY',
        message: 'No non-empty sample is available for this column.',
        examples: Object.freeze([]),
      });
    }

    try {
      const examples = samples.map((source, sampleIndex) => {
        const context = Object.freeze({
          random,
          mappingContext,
          basicProvider,
          dateShiftContext,
          relationshipRegistry,
          sourceRowIndex: null,
          outputRowIndex: sampleIndex,
          entityKey: `action-preview:${sampleIndex}`,
          forceUniqueInstance: false,
          options: Object.freeze({
            preserveIntervals: true,
            preserveDistribution: true,
            businessFidelity: fidelity.level,
            businessFidelitySettings: fidelity.settings,
          }),
        });
        const executionValue = policy.selectedAction === 'REPLACE' && fidelity.settings.preserveCodeShape
          ? createTemplateDescriptor('REPLACE', source, {
              actionParams: policy.actionParams,
              detectedType: policy.detectedType,
              columnName: policy.columnName,
            })
          : source;
        const result = executor({
          value: executionValue,
          columnIndex,
          policy,
          profile: profiles[columnIndex],
          detection: detections[columnIndex],
          context,
          row: [],
        });
        return Object.freeze({ source: String(source ?? ''), proposed: previewValue(result) });
      });
      return Object.freeze({
        columnIndex,
        columnName: policy.columnName,
        action: policy.selectedAction,
        status: 'READY',
        message: null,
        businessFidelity: fidelity.level,
        examples: Object.freeze(examples),
      });
    } catch (error) {
      return Object.freeze({
        columnIndex,
        columnName: policy.columnName,
        action: policy.selectedAction,
        status: 'ERROR',
        message: error?.message ?? 'This action preview could not be produced.',
        examples: Object.freeze([]),
      });
    }
  }));
}
