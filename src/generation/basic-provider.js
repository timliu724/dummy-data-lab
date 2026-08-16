import { generateFromPattern } from './pattern-generator.js';
import { isOrganisationNameHeader } from '../detection/header-normalization.js';
import { syntheticCategoryLabel, syntheticColumnValueLabel } from './synthetic-category-label.js';

function token(random, length = 8) {
  const alphabet = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
  return Array.from({ length }, () => random.pick(alphabet)).join('');
}

function normalizedHeader(columnName) {
  return String(columnName ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function organisationReplacement({ columnName, sourceValue, suffix }) {
  const header = normalizedHeader(columnName);
  let label = 'Example Organisation';
  if (/asc|service_(?:centre|center)/.test(header)) label = 'Example Service Centre';
  else if (/collection_point/.test(header)) label = 'Example Collection Centre';
  else if (/supplier|vendor/.test(header)) label = 'Example Supplier';
  else if (/dealer/.test(header)) label = 'Example Dealer';
  else if (/branch/.test(header)) label = 'Example Branch';
  else if (/clinic|hospital/.test(header)) label = 'Example Health Service';
  const output = `${label} ${suffix.slice(0, 4).toUpperCase()}`;
  const source = String(sourceValue ?? '');
  return source && source === source.toLocaleUpperCase() ? output.toLocaleUpperCase() : output;
}

export class BasicProvider {
  constructor({ random } = {}) {
    if (!random) throw new TypeError('random is required.');
    this.random = random;
  }

  replacement({ detectedType = 'UNKNOWN', sourceValue = '', columnName = '', attempt = 0 }) {
    const suffix = token(this.random, 8);
    if (detectedType === 'EMAIL') return `test_${suffix}@example.invalid`;
    if (/signature|signoff|signed/i.test(columnName)) return `Test Signature ${suffix.slice(0, 4).toUpperCase()}`;
    if (isOrganisationNameHeader(columnName)) return organisationReplacement({ columnName, sourceValue, suffix });
    if (detectedType === 'NAME_LIKE') return `Test Person ${suffix.slice(0, 4).toUpperCase()}`;
    if (detectedType === 'PHONE_LIKE') return generateFromPattern(sourceValue || '0400 000 000', { random: this.random, preserveSafeAffixes: false });
    if (detectedType === 'ADDRESS_LIKE') return `${this.random.integer(1, 999)} Example Street, Testville`;
    if (detectedType === 'BOOLEAN') return this.random.pick(['true', 'false']);
    if (detectedType === 'INTEGER' || detectedType === 'NUMERIC_ID') return String(this.random.integer(1, 2_000_000_000));
    if (['DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE'].includes(detectedType)) return (this.random.nextFloat() * 1000).toFixed(2);
    if (detectedType === 'DATE' || detectedType === 'AMBIGUOUS_DATE') return `${this.random.integer(2020, 2035)}-${String(this.random.integer(1, 12)).padStart(2, '0')}-${String(this.random.integer(1, 28)).padStart(2, '0')}`;
    if (detectedType === 'TIME') return `${String(this.random.integer(0, 23)).padStart(2, '0')}:${String(this.random.integer(0, 59)).padStart(2, '0')}:00`;
    if (detectedType === 'DATETIME') return `${this.random.integer(2020, 2035)}-01-01 ${String(this.random.integer(0, 23)).padStart(2, '0')}:00:00`;
    if (detectedType === 'CATEGORY') return syntheticCategoryLabel({
      columnName,
      ordinal: this.random.integer(1, 12),
    });
    return syntheticColumnValueLabel({
      columnName,
      suffix: `${suffix.slice(0, 6).toUpperCase()}${attempt > 0 ? `-${attempt + 1}` : ''}`,
    });
  }
}
