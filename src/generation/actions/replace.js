import { normaliseActionParams } from '../../policy/action-parameters.js';
import { replacementIdentityKey } from '../replacement-identity.js';
import { parseTemplateDescriptor } from '../template-descriptors.js';
import { applyGeneratedAffixes, generateFromShape } from '../pattern-generator.js';
import { REPLACEMENT_BEHAVIORS } from '../../policy/action-parameters.js';

export function executeReplace({ value, policy, profile, context }) {
  const descriptor = parseTemplateDescriptor(value);
  const params = normaliseActionParams({
    action: 'REPLACE',
    detectedType: policy.detectedType,
    params: policy.actionParams,
  });
  if (params.preserveNulls !== false && (value === null || value === undefined || String(value).trim() === '')) {
    return Object.freeze({ value: '', dropped: false, warnings: Object.freeze([]) });
  }
  const linkedScope = context.relationshipRegistry?.mappingScopeFor(policy.columnName) ?? null;
  const scope = linkedScope ?? `column:${policy.columnName}`;
  const repeatHandling = context.options?.businessFidelitySettings?.preserveStableMappings === false && !linkedScope
    ? REPLACEMENT_BEHAVIORS.INDEPENDENT
    : params.repeatHandling;
  const originalKey = replacementIdentityKey({
    sourceIdentity: value,
    entityKey: context.entityKey,
    forceUniqueInstance: (profile?.uniqueRatio ?? 0) >= 0.98 && context.forceUniqueInstance,
    repeatHandling,
  });
  const useCodeShape = Boolean(
    context.options?.businessFidelitySettings?.preserveCodeShape
    && descriptor?.codeStructure
    && policy.detectedType !== 'CATEGORY'
  );
  const generated = context.mappingContext.resolve(
    scope,
    originalKey,
    (attempt) => {
      if (useCodeShape) {
        let output = generateFromShape(descriptor.shape, { random: context.random });
        const prefix = descriptor.codeStructure.prefix
          ? context.mappingContext.resolve(
              `${scope}:prefix-family`,
              descriptor.codeStructure.prefix.identity,
              () => generateFromShape(descriptor.codeStructure.prefix.shape, { random: context.random }),
            )
          : '';
        if (prefix) output = applyGeneratedAffixes(output, { prefix });
        return output;
      }
      return context.basicProvider.replacement({
        detectedType: policy.detectedType,
        sourceValue: descriptor ? '' : value,
        columnName: policy.columnName,
        attempt,
      });
    },
  );
  return Object.freeze({ value: generated, dropped: false, warnings: Object.freeze([]) });
}
