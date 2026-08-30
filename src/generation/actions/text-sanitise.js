import { createContractWarning } from '../../core/contracts.js';
import { parseTemplateDescriptor } from '../template-descriptors.js';

const SAFE_SENTENCES = Object.freeze([
  'Follow-up is scheduled after the initial review.',
  'The request was checked and is ready for the next step.',
  'A routine update was recorded for the support team.',
  'The item requires a final check before completion.',
  'The customer was notified and no further action is due.',
  'An additional assessment is planned for the next visit.',
  'The case remains open while the latest details are reviewed.',
  'The service team confirmed the next action in the workflow.',
]);

function safeTestText(descriptor) {
  const targetLength = Math.max(20, Math.min(200, descriptor.lengthBucket));
  const start = Number.parseInt(descriptor.identity.slice(0, 6), 16) % SAFE_SENTENCES.length;
  const parts = [];
  let index = start;
  while (parts.join(' ').length < targetLength && parts.length < SAFE_SENTENCES.length) {
    const next = SAFE_SENTENCES[index % SAFE_SENTENCES.length];
    const combined = [...parts, next].join(' ');
    if (combined.length > 200 && parts.length > 0) break;
    parts.push(next);
    index += 1;
  }
  return parts.join(' ');
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
    value: descriptor ? safeTestText(descriptor) : sanitiseText(value),
    dropped: false,
    warnings: Object.freeze([createContractWarning(
      'TEXT_SANITISATION_NOT_GUARANTEED',
      'Pattern-based text sanitisation can miss context-specific identifiers and requires review.',
      { columnName: policy.columnName },
    )]),
  });
}
