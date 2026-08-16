import { sampleDistribution } from '../distribution-sampler.js';
import { isRecognisedNumericMissingSentinel } from '../numeric-missing-sentinel.js';

export function executeResample({ value, columnIndex, policy, profile, context }) {
  if (context.options?.businessFidelitySettings?.preserveNullPositions
    && (value === null || value === undefined || String(value).trim() === '')) {
    return Object.freeze({ value: '', dropped: false, warnings: Object.freeze([]) });
  }
  const sourceText = String(value ?? '').trim();
  if (isRecognisedNumericMissingSentinel({
    value: sourceText,
    policy,
    profile,
    sourceValueObserved: true,
  })) {
    return Object.freeze({ value: sourceText, dropped: false, warnings: Object.freeze([]) });
  }
  return Object.freeze({
    value: context.distributionSampler?.sample({
      profile,
      detectedType: policy.detectedType,
      columnIndex,
    }) ?? sampleDistribution({ profile, detectedType: policy.detectedType, random: context.random }),
    dropped: false,
    warnings: Object.freeze([]),
  });
}
