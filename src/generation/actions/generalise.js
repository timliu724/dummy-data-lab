import { generaliseValue } from '../generalisation-rules.js';
import { parseTemplateDescriptor } from '../template-descriptors.js';
import { syntheticCategoryLabel } from '../synthetic-category-label.js';

function descriptorGroup(identity, maximum = 12) {
  return (Number.parseInt(identity.slice(0, 8), 16) % maximum) + 1;
}

function generaliseDescriptor(descriptor, policy) {
  if (descriptor.generalisedValue !== null) return descriptor.generalisedValue;
  const group = descriptorGroup(descriptor.identity);
  if (policy.detectedType === 'CATEGORY') return syntheticCategoryLabel({
    columnName: policy.columnName,
    ordinal: group,
    group: true,
  });
  if (policy.detectedType === 'ADDRESS_LIKE') return `Generalised Area ${group}`;
  if (['DATE', 'AMBIGUOUS_DATE'].includes(policy.detectedType)) return `${2020 + (group % 10)}-01-01`;
  if (policy.detectedType === 'DATETIME') return `${2020 + (group % 10)}-01-01 00:00:00`;
  if (policy.detectedType === 'TIME') return `${String((group * 2) % 24).padStart(2, '0')}:00:00`;
  if (['INTEGER', 'NUMERIC_ID'].includes(policy.detectedType)) return String(group * 10);
  if (policy.detectedType === 'DECIMAL') return `${group * 10}.00`;
  if (policy.detectedType === 'PERCENTAGE') return `${group * 5}%`;
  if (policy.detectedType === 'CURRENCY_LIKE') return `$${group * 100}`;
  return `Generalised Value ${group}`;
}

export function executeGeneralise({ value, policy }) {
  const descriptor = parseTemplateDescriptor(value);
  return Object.freeze({
    value: descriptor
      ? generaliseDescriptor(descriptor, policy)
      : generaliseValue(value, {
        detectedType: policy.detectedType,
        columnName: policy.columnName,
        strategy: policy.actionParams?.strategy,
        level: policy.actionParams?.level,
      }),
    dropped: false,
    warnings: Object.freeze([]),
  });
}
