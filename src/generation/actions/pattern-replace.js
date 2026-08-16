import {
  applyGeneratedAffixes,
  generateFromCustomMask,
  generateFromCustomPattern,
  generateFromPattern,
  generateFromShape,
} from '../pattern-generator.js';
import { normaliseActionParams, PATTERN_MODES, REPLACEMENT_BEHAVIORS } from '../../policy/action-parameters.js';
import { replacementIdentityKey } from '../replacement-identity.js';
import { parseTemplateDescriptor } from '../template-descriptors.js';
import { activeMultiValueTokenization } from '../../detection/multi-value-pattern.js';
import { valueShape } from '../../detection/pattern-utils.js';

function safePatternAffix(pattern, direction) {
  const evidence = direction === 'prefix' ? pattern?.commonPrefix : pattern?.commonSuffix;
  const value = evidence?.coverage >= 0.8 ? String(evidence.value ?? '') : '';
  if (!/^[A-Za-z0-9]{2,8}$/.test(value)) return '';
  if (/^\d+$/.test(value) && value.length > 4) return '';
  return value;
}

function matchingGroup(sourceText, groups, direction) {
  return [...(groups ?? [])]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => direction === 'prefix' ? sourceText.startsWith(candidate) : sourceText.endsWith(candidate));
}

function affixCompatibleWithShape(shape, affix, direction) {
  const structuralShape = String(shape ?? '');
  const affixShape = valueShape(affix);
  if (!structuralShape || !affixShape) return false;
  return direction === 'prefix'
    ? structuralShape.startsWith(affixShape)
    : structuralShape.endsWith(affixShape);
}

function generatePatternItem({
  sourceIdentity,
  sourceText = null,
  shape = null,
  patternMask = null,
  params,
  pattern,
  context,
  scope,
  unique,
  columnName,
  hasSourceIdentity = true,
}) {
  const originalKey = replacementIdentityKey({
    sourceIdentity,
    entityKey: context.entityKey,
    forceUniqueInstance: unique && context.forceUniqueInstance,
    repeatHandling: params.repeatHandling,
    hasSourceIdentity,
  });
  return context.mappingContext.resolve(scope, originalKey, () => {
    if (params.patternMode === PATTERN_MODES.CUSTOM) {
      if (shape !== null) {
        if (!patternMask) throw new RangeError(`Custom pattern for ${columnName} requires refreshed bounded templates.`);
        return generateFromCustomMask(shape, patternMask, { random: context.random });
      }
      return generateFromCustomPattern(sourceText, { random: context.random, params });
    }
    if (shape !== null) {
      const output = patternMask && params.patternMode === PATTERN_MODES.AUTO
        ? generateFromCustomMask(shape, patternMask, { random: context.random })
        : generateFromShape(shape, { random: context.random });
      const detectedPrefix = safePatternAffix(pattern, 'prefix');
      const detectedSuffix = safePatternAffix(pattern, 'suffix');
      return params.patternMode === PATTERN_MODES.AUTO
        ? applyGeneratedAffixes(output, {
            prefix: affixCompatibleWithShape(shape, detectedPrefix, 'prefix') ? detectedPrefix : '',
            suffix: affixCompatibleWithShape(shape, detectedSuffix, 'suffix') ? detectedSuffix : '',
          })
        : output;
    }
    const text = String(sourceText ?? '');
    return generateFromPattern(text, {
      random: context.random,
      prefix: matchingGroup(text, params.autoPrefixGroups, 'prefix') ?? safePatternAffix(pattern, 'prefix'),
      suffix: matchingGroup(text, params.autoSuffixGroups, 'suffix') ?? safePatternAffix(pattern, 'suffix'),
      preserveSafeAffixes: params.patternMode === PATTERN_MODES.AUTO,
    });
  });
}

function generateMultiValue({ parts, params, pattern, context, scope, unique, columnName }) {
  return parts.map((part) => {
    if (part.kind === 'SEPARATOR') {
      if (!/^[\s,;|/]+$/u.test(part.value)) throw new RangeError(`Multi-value separator for ${columnName} is unsafe.`);
      return part.value;
    }
    if (part.kind !== 'ITEM') throw new RangeError(`Multi-value template for ${columnName} is invalid.`);
    return generatePatternItem({
      sourceIdentity: part.identity ?? part.value,
      sourceText: part.value ?? null,
      shape: part.shape ?? null,
      patternMask: part.patternMask ?? null,
      params,
      pattern,
      context,
      scope: `${scope}:multi-item`,
      unique,
      columnName,
    });
  }).join('');
}

export function executePatternReplace({ value, policy, profile, detection, context }) {
  const linkedScope = context.relationshipRegistry?.mappingScopeFor(policy.columnName) ?? null;
  const scope = linkedScope ?? `column:${policy.columnName}`;
  const unique = (profile?.uniqueRatio ?? 0) >= 0.98;
  const pattern = detection?.details?.pattern;
  const descriptor = parseTemplateDescriptor(value);
  const shapePlaceholder = String(value ?? '').match(/^<PATTERN:(.*)>$/s);
  const descriptorShape = descriptor?.action === 'PATTERN_REPLACE' ? descriptor.shape : null;
  if (String(value ?? '').trim() === '' || shapePlaceholder?.[1] === '' || descriptorShape === '') {
    return Object.freeze({ value: '', dropped: false, warnings: Object.freeze([]) });
  }
  const normalisedParams = normaliseActionParams({
    action: 'PATTERN_REPLACE',
    detectedType: policy.detectedType,
    params: policy.actionParams,
  });
  const params = context.options?.businessFidelitySettings?.preserveStableMappings === false && !linkedScope
    ? Object.freeze({ ...normalisedParams, repeatHandling: REPLACEMENT_BEHAVIORS.INDEPENDENT })
    : normalisedParams;
  const descriptorMulti = descriptor?.patternMask?.kind === 'MULTI_VALUE' ? descriptor.patternMask : null;
  const descriptorMultiActive = descriptorMulti && (params.multiValueMode === 'FORCE'
    || (params.multiValueMode === 'AUTO' && params.multiValueDetected))
    ? descriptorMulti
    : null;
  if (descriptorMulti && !descriptorMultiActive) {
    throw new RangeError(`Multi-value setting for ${policy.columnName} requires refreshed bounded templates.`);
  }
  const rawMulti = descriptor || shapePlaceholder ? null : activeMultiValueTokenization(value, params);
  if (descriptorMultiActive || rawMulti) {
    const generated = generateMultiValue({
      parts: descriptorMultiActive?.parts ?? rawMulti.parts,
      params,
      pattern,
      context,
      scope,
      unique,
      columnName: policy.columnName,
    });
    return Object.freeze({ value: generated, dropped: false, warnings: Object.freeze([]) });
  }
  if (shapePlaceholder && params.patternMode === PATTERN_MODES.CUSTOM) {
    throw new RangeError(`Custom pattern for ${policy.columnName} cannot use a legacy shape-only template.`);
  }
  const generated = generatePatternItem({
    sourceIdentity: value,
    sourceText: descriptorShape === null && !shapePlaceholder ? value : null,
    shape: descriptorShape ?? shapePlaceholder?.[1] ?? null,
    patternMask: descriptor?.patternMask ?? null,
    params,
    pattern,
    context,
    scope,
    unique,
    columnName: policy.columnName,
    hasSourceIdentity: Boolean(descriptor) || !shapePlaceholder,
  });
  return Object.freeze({ value: generated, dropped: false, warnings: Object.freeze([]) });
}
