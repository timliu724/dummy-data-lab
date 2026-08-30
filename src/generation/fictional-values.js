const FIRST_NAMES = Object.freeze([
  'Aisha', 'Alex', 'Amelia', 'Aria', 'Avery', 'Benjamin', 'Caleb', 'Chloe',
  'Daniel', 'Eleanor', 'Elijah', 'Emma', 'Ethan', 'Eva', 'Felix', 'Grace',
  'Hannah', 'Harper', 'Hugo', 'Isla', 'Jasmine', 'Jonah', 'Kai', 'Layla',
  'Leo', 'Liam', 'Lily', 'Lucas', 'Maya', 'Mia', 'Nadia', 'Noah',
  'Olivia', 'Oscar', 'Priya', 'Quinn', 'Riley', 'Ruby', 'Sam', 'Sofia',
  'Theo', 'Thomas', 'Zara', 'Zoe', 'Adrian', 'Clara', 'Mila', 'Nico',
]);

const LAST_NAMES = Object.freeze([
  'Anders', 'Bennett', 'Brooks', 'Campbell', 'Carter', 'Chen', 'Clarke', 'Costa',
  'Davis', 'Edwards', 'Evans', 'Foster', 'Garcia', 'Green', 'Harris', 'Hayes',
  'Hughes', 'Ibrahim', 'Ivanov', 'Jackson', 'James', 'Kaur', 'Khan', 'Kim',
  'Lee', 'Lewis', 'Martin', 'Miller', 'Mitchell', 'Morgan', 'Morris', 'Nguyen',
  'Patel', 'Reed', 'Rivera', 'Roberts', 'Ross', 'Shah', 'Singh', 'Taylor',
  'Thomas', 'Walker', 'Wang', 'Ward', 'Williams', 'Wilson', 'Wright', 'Young',
]);

const PLACE_PREFIXES = Object.freeze([
  'Ash', 'Blue', 'Cedar', 'Clear', 'Fern', 'Glen', 'Harbour', 'Lake',
  'Maple', 'Meadow', 'Oak', 'Pine', 'River', 'Rose', 'Silver', 'Willow',
]);
const PLACE_SUFFIXES = Object.freeze([
  'bank', 'brook', 'dale', 'field', 'ford', 'grove', 'haven', 'mere',
  'mont', 'ridge', 'vale', 'view', 'wood', 'worth',
]);
const STREET_NAMES = Object.freeze([
  'Acacia', 'Banksia', 'Cedar', 'Garden', 'Harbour', 'Hill', 'Jasmine', 'Lake',
  'Maple', 'Meadow', 'Oak', 'Orchard', 'Park', 'Pine', 'River', 'Rose',
  'Silver', 'Spring', 'Willow', 'Wren',
]);
const STREET_TYPES = Object.freeze(['Avenue', 'Drive', 'Lane', 'Road', 'Street', 'Way']);

function alphaNumericToken(random, length = 6) {
  const alphabet = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
  return Array.from({ length }, () => random.pick(alphabet)).join('');
}

export function fictionalPersonName(random) {
  return `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
}

export function fictionalEmail(random) {
  return `${random.pick(PLACE_PREFIXES).toLocaleLowerCase()}${random.integer(10, 9999)}@example.com`;
}

export function fictionalPlace(random) {
  return `${random.pick(PLACE_PREFIXES)}${random.pick(PLACE_SUFFIXES)}`;
}

export function fictionalAddress(random) {
  return `${random.integer(1, 999)} ${random.pick(STREET_NAMES)} ${random.pick(STREET_TYPES)}, ${fictionalPlace(random)}`;
}

export function fictionalOrganisation(random, kind = 'Service Centre') {
  return `${fictionalPlace(random)} ${kind}`;
}

export function fictionalUrl(random, sourceValue = '') {
  const source = String(sourceValue ?? '').trim();
  const extension = source.match(/\.([a-z0-9]{1,8})(?:[?#].*)?$/i)?.[1]?.toLocaleLowerCase();
  const suffix = extension ? `.${extension}` : '';
  const separator = String.fromCharCode(58, 47, 47);
  return 'https' + separator + 'example.com/files/' + alphaNumericToken(random, 10) + suffix;
}
