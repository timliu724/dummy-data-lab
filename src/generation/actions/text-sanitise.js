import { createContractWarning } from '../../core/contracts.js';
import { parseTemplateDescriptor } from '../template-descriptors.js';

function syntheticTestText(descriptor) {
  const targetLength = Math.max(20, Math.min(200, descriptor.lengthBucket));
  const phrase = `Synthetic test note ${descriptor.identity.slice(0, 6)}. `;
  return phrase.repeat(Math.ceil(targetLength / phrase.length)).slice(0, targetLength).trimEnd();
}

export function sanitiseText(value) {
  return String(value ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[EMAIL]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[PHONE_OR_NUMBER]')
    .replace(/\b(?:ID|REF|CASE|ACCOUNT|ACCT)[- _:#]*[A-Z0-9-]{4,}\b/giu, '[IDENTIFIER]')
    .replace(/\b\d{6,}\b/g, '[NUMBER]');
}

export function executeTextSanitise({ value, policy }) {
  const descriptor = parseTemplateDescriptor(value);
  return Object.freeze({
    value: descriptor ? syntheticTestText(descriptor) : sanitiseText(value),
    dropped: false,
    warnings: Object.freeze([createContractWarning(
      'TEXT_SANITISATION_NOT_GUARANTEED',
      'Pattern-based text sanitisation can miss context-specific identifiers and requires review.',
      { columnName: policy.columnName },
    )]),
  });
}
