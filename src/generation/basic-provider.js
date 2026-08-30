import { generateFromPattern } from './pattern-generator.js';
import { isOrganisationNameHeader } from '../detection/header-normalization.js';
import { syntheticCategoryLabel, syntheticColumnValueLabel } from './synthetic-category-label.js';
import { shiftDateByDays, shiftDateTimeByMinutes, shiftTimeByMinutes } from './fixed-shift.js';
import {
  fictionalAddress,
  fictionalEmail,
  fictionalOrganisation,
  fictionalPersonName,
  fictionalPlace,
  fictionalUrl,
} from './fictional-values.js';

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

function organisationReplacement({ columnName, sourceValue, random }) {
  const header = normalizedHeader(columnName);
  let kind = 'Organisation';
  if (/asc|service_(?:centre|center)/.test(header)) kind = 'Service Centre';
  else if (/collection_point/.test(header)) kind = 'Collection Centre';
  else if (/supplier|vendor/.test(header)) kind = 'Supplier';
  else if (/dealer/.test(header)) kind = 'Dealer';
  else if (/branch/.test(header)) kind = 'Branch';
  else if (/clinic|hospital/.test(header)) kind = 'Health Service';
  const output = fictionalOrganisation(random, kind);
  const source = String(sourceValue ?? '');
  return source && source === source.toLocaleUpperCase() ? output.toLocaleUpperCase() : output;
}

function shiftedTemporalValue(detectedType, sourceValue) {
  try {
    if (detectedType === 'DATE' || detectedType === 'AMBIGUOUS_DATE') return shiftDateByDays(sourceValue, 6);
    if (detectedType === 'TIME') return shiftTimeByMinutes(sourceValue, 360);
    if (detectedType === 'DATETIME') return shiftDateTimeByMinutes(sourceValue, 9000);
  } catch {
    return null;
  }
  return null;
}

export class BasicProvider {
  constructor({ random } = {}) {
    if (!random) throw new TypeError('random is required.');
    this.random = random;
  }

  replacement({ detectedType = 'UNKNOWN', sourceValue = '', columnName = '', attempt = 0 }) {
    const suffix = token(this.random, 8);
    const header = normalizedHeader(columnName);
    if (/^https?:\/\//i.test(String(sourceValue).trim())) return fictionalUrl(this.random, sourceValue);
    if (detectedType === 'EMAIL') return fictionalEmail(this.random);
    if (/signature|signoff|signed/i.test(columnName)) return `Signed by ${fictionalPersonName(this.random)}`;
    if (isOrganisationNameHeader(columnName)) return organisationReplacement({ columnName, sourceValue, random: this.random });
    if (detectedType === 'NAME_LIKE') return fictionalPersonName(this.random);
    if (detectedType === 'PHONE_LIKE') return generateFromPattern(sourceValue || '0400 000 000', { random: this.random, preserveSafeAffixes: false });
    if (/(^|_)(postcode|post_code|postal_code|zip|zip_code)(_|$)/.test(header)) {
      return generateFromPattern(sourceValue || '0000', { random: this.random, preserveSafeAffixes: false });
    }
    if (/(^|_)(suburb|city|town|locality|location)(_|$)/.test(header)) return fictionalPlace(this.random);
    if (detectedType === 'ADDRESS_LIKE') return fictionalAddress(this.random);
    if (detectedType === 'BOOLEAN') return this.random.pick(['true', 'false']);
    if (detectedType === 'INTEGER' || detectedType === 'NUMERIC_ID') return String(this.random.integer(1, 2_000_000_000));
    if (['DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE'].includes(detectedType)) return (this.random.nextFloat() * 1000).toFixed(2);
    const shiftedTemporal = shiftedTemporalValue(detectedType, sourceValue);
    if (shiftedTemporal !== null) return shiftedTemporal;
    if (detectedType === 'DATE' || detectedType === 'AMBIGUOUS_DATE') return `${this.random.integer(2020, 2035)}-${String(this.random.integer(1, 12)).padStart(2, '0')}-${String(this.random.integer(1, 28)).padStart(2, '0')}`;
    if (detectedType === 'TIME') return `${String(this.random.integer(0, 23)).padStart(2, '0')}:${String(this.random.integer(0, 59)).padStart(2, '0')}:00`;
    if (detectedType === 'DATETIME') return `${this.random.integer(2020, 2035)}-01-01 ${String(this.random.integer(0, 23)).padStart(2, '0')}:00:00`;
    if (detectedType === 'CATEGORY') return syntheticCategoryLabel({
      columnName,
      ordinal: this.random.integer(1, 12),
    });
    if (detectedType === 'GENERAL_TEXT') return syntheticCategoryLabel({
      columnName,
      ordinal: this.random.integer(1, 702) + attempt * 702,
    });
    return syntheticColumnValueLabel({
      columnName,
      suffix: `${suffix.slice(0, 6).toUpperCase()}${attempt > 0 ? `-${attempt + 1}` : ''}`,
    });
  }
}
