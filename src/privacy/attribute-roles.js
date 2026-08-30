import { ATTRIBUTE_ROLES, ATTRIBUTE_ROLE_VALUES } from '../core/constants.js';
import { isOrganisationNameHeader, normalizeHeader } from '../detection/header-normalization.js';

export const ATTRIBUTE_ROLE_LABELS = Object.freeze({
  DIRECT_IDENTIFIER: 'Direct identifier',
  QUASI_IDENTIFIER: 'Quasi-identifier',
  SENSITIVE_ATTRIBUTE: 'Sensitive attribute',
  ORDINARY: 'Ordinary field',
});

const DIRECT_TYPES = new Set([
  'EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE',
  'AU_ABN', 'AU_ACN', 'AU_TFN', 'AU_MEDICARE',
]);

const SENSITIVE_HEADER = /(^|_)(diagnosis|condition|health|medical|medication|disability|religion|ethnicity|race|salary|income|wage|credit|criminal|offence|biometric|genetic|sexual|union)(_|$)/;
const QUASI_HEADER = /(^|_)(birth|dob|age|gender|sex|postcode|postal|zip|suburb|city|state|country|occupation|job_title|profession|nationality|marital)(_|$)/;
const PERSON_CONTEXT = /(^|_)(customer|client|employee|patient|member|person|user|contact|applicant|resident)(_|$)/;
const DIRECT_HEADER = /(^|_)(identifier|passport|licence|license|medicare|tfn|email|phone|mobile|account_number|member_number|customer_number|employee_number|employee_resp|employee_responsible|patient_number|created_by|updated_by|modified_by|last_modified_by|entered_by|submitted_by|assigned_to|assignee|record_owner)(_|$)/;
const PERSON_ENTITY_ID_HEADER = /^(customer|consumer|employee|engineer|technician|member|patient|applicant|resident|user)$/;
const PERSON_ENTITY_ID_TYPES = new Set(['INTEGER', 'DECIMAL', 'NUMERIC_ID', 'ALPHANUMERIC_CODE', 'GENERAL_TEXT']);

function result(role, confidence, reason) {
  return Object.freeze({ role, confidence, reason, source: 'INFERRED' });
}

export function inferAttributeRole({ profile, detection, riskAssessment } = {}) {
  const header = normalizeHeader(profile?.columnName);
  const type = detection?.type ?? 'UNKNOWN';
  if (type.startsWith('AU_')) {
    return result(ATTRIBUTE_ROLES.DIRECT_IDENTIFIER, 'HIGH', `${type} is a checksum-recognized structured identifier.`);
  }
  if (type === 'NAME_LIKE' && isOrganisationNameHeader(profile?.columnName)) {
    return result(ATTRIBUTE_ROLES.ORDINARY, 'HIGH', 'The header indicates an organisation or service-location name rather than a person name.');
  }
  if (DIRECT_TYPES.has(type)) {
    const confidence = ['EMAIL', 'PHONE_LIKE', 'NAME_LIKE', 'ADDRESS_LIKE'].includes(type) ? 'HIGH' : 'MEDIUM';
    return result(ATTRIBUTE_ROLES.DIRECT_IDENTIFIER, confidence, `${type} can identify or consistently single out a record.`);
  }
  if (DIRECT_HEADER.test(header) || (/(^|_)id$/.test(header) && (riskAssessment?.level === 'HIGH' || PERSON_CONTEXT.test(header)))) {
    return result(ATTRIBUTE_ROLES.DIRECT_IDENTIFIER, 'MEDIUM', 'The column name and risk evidence indicate a record or person identifier.');
  }
  if (PERSON_ENTITY_ID_HEADER.test(header) && PERSON_ENTITY_ID_TYPES.has(type)) {
    return result(ATTRIBUTE_ROLES.DIRECT_IDENTIFIER, 'MEDIUM', 'A numeric or code-shaped value under a person-role heading is likely a person reference, not a measurement.');
  }
  if (SENSITIVE_HEADER.test(header)) {
    return result(ATTRIBUTE_ROLES.SENSITIVE_ATTRIBUTE, 'HIGH', 'The column name indicates health, financial, belief, identity, or other sensitive information.');
  }
  if (QUASI_HEADER.test(header)) {
    return result(ATTRIBUTE_ROLES.QUASI_IDENTIFIER, 'MEDIUM', 'The column name describes a demographic or location attribute that may identify people in combination.');
  }
  if (['DATE', 'DATETIME', 'AMBIGUOUS_DATE'].includes(type) && PERSON_CONTEXT.test(header)) {
    return result(ATTRIBUTE_ROLES.QUASI_IDENTIFIER, 'MEDIUM', 'A person-related date can become identifying when combined with other attributes.');
  }
  return result(ATTRIBUTE_ROLES.ORDINARY, 'MEDIUM', 'No identifier or sensitive-data signal was found.');
}

export function normalizeAttributeRole(role) {
  if (!ATTRIBUTE_ROLE_VALUES.includes(role)) throw new RangeError('Unknown attribute role.');
  return role;
}
