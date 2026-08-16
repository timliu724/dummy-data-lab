import { validateActionParams } from '../policy/action-parameters.js';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

function generatedCharacter(character, random) {
  if (/\p{Lu}/u.test(character)) return random.pick([...UPPER]);
  if (/\p{Ll}/u.test(character)) return random.pick([...LOWER]);
  if (/\p{L}/u.test(character)) return random.pick([...LOWER]);
  if (/\p{N}/u.test(character)) return random.pick([...DIGITS]);
  return character;
}

function safeAffix(affix) {
  if (typeof affix !== 'string') return '';
  if (!/^[A-Za-z0-9]{2,8}$/.test(affix)) return '';
  if (/^\d+$/.test(affix) && affix.length > 4) return '';
  return affix;
}

function tokenKind(character) {
  if (/\p{L}/u.test(character)) return 'LETTERS';
  if (/\p{N}/u.test(character)) return 'DIGITS';
  return 'SEPARATOR';
}

export function patternSegments(value) {
  const characters = [...String(value ?? '')];
  const segments = [];
  let mutableIndex = 0;
  for (let start = 0; start < characters.length;) {
    const kind = tokenKind(characters[start]);
    let end = start + 1;
    while (end < characters.length && tokenKind(characters[end]) === kind) end += 1;
    segments.push(Object.freeze({
      kind,
      value: characters.slice(start, end).join(''),
      start,
      end,
      segmentIndex: kind === 'SEPARATOR' ? null : mutableIndex++,
    }));
    start = end;
  }
  return Object.freeze(segments);
}

function requireSameLength(replacement, expectedLength, label) {
  if ([...String(replacement ?? '')].length !== expectedLength) {
    throw new RangeError(`${label} replacement must contain exactly ${expectedLength} characters to preserve the detected format.`);
  }
}

function applyRangeAction(states, source, start, end, action, replacement, label) {
  if (action === 'DEFAULT') return;
  if (action === 'REPLACE') requireSameLength(replacement, end - start, label);
  const replacementCharacters = [...String(replacement ?? '')];
  for (let index = start; index < end; index += 1) {
    states[index] = action === 'GENERATE'
      ? null
      : action === 'REPLACE'
        ? replacementCharacters[index - start]
        : source[index];
  }
}

export function createCustomPatternMask(sourceValue, params) {
  const validation = validateActionParams({ action: 'PATTERN_REPLACE', params });
  if (!validation.valid) throw new RangeError(validation.errors.join(' '));
  const source = [...String(sourceValue ?? '')];
  const prefixLength = Number(params.prefixLength ?? 0);
  const suffixLength = Number(params.suffixLength ?? 0);
  if (prefixLength + suffixLength > source.length) {
    throw new RangeError('Custom prefix and suffix lengths overlap for this sample.');
  }
  const states = source.map((character) => tokenKind(character) === 'SEPARATOR'
    ? character
    : params.customDefaultAction === 'KEEP' ? character : null);
  const segments = patternSegments(source.join(''));
  const rules = new Map((params.segmentRules ?? []).map((rule) => [rule.segmentIndex, rule]));
  for (const segment of segments) {
    if (segment.segmentIndex === null) continue;
    const rule = rules.get(segment.segmentIndex);
    if (!rule || rule.action === 'DEFAULT') continue;
    applyRangeAction(states, source, segment.start, segment.end, rule.action, rule.replacement, `Segment ${segment.segmentIndex + 1}`);
  }
  applyRangeAction(states, source, 0, prefixLength, params.prefixAction, params.prefixReplacement, 'Prefix');
  applyRangeAction(states, source, source.length - suffixLength, source.length, params.suffixAction, params.suffixReplacement, 'Suffix');

  const hasGeneratedPosition = states.some((value) => value === null);
  const hasChangedLiteral = states.some((value, index) => value !== null && value !== source[index]);
  if (!hasGeneratedPosition && !hasChangedLiteral) {
    throw new RangeError('Custom pattern keeps the complete source value. Generate or replace at least one part, or choose KEEP explicitly.');
  }
  return Object.freeze({
    literals: Object.freeze(states.flatMap((value, index) => value === null ? [] : [Object.freeze([index, value])])),
    generatedPositionCount: states.filter((value) => value === null).length,
  });
}

export function createAutoPatternMask(sourceValue, params) {
  const source = [...String(sourceValue ?? '')];
  const states = source.map((character) => tokenKind(character) === 'SEPARATOR' ? character : null);
  const longestMatch = (values, direction) => [...(values ?? [])]
    .sort((left, right) => [...right].length - [...left].length)
    .find((value) => direction === 'prefix'
      ? source.join('').startsWith(value)
      : source.join('').endsWith(value));
  const prefix = longestMatch(params.autoPrefixGroups, 'prefix');
  const suffix = longestMatch(params.autoSuffixGroups, 'suffix');
  if (prefix) applyRangeAction(states, source, 0, [...prefix].length, 'KEEP', '', 'Automatic prefix');
  if (suffix) applyRangeAction(states, source, source.length - [...suffix].length, source.length, 'KEEP', '', 'Automatic suffix');
  if (!prefix && !suffix) return null;
  if (!states.some((value) => value === null)) return null;
  return Object.freeze({
    literals: Object.freeze(states.flatMap((value, index) => value === null ? [] : [Object.freeze([index, value])])),
    generatedPositionCount: states.filter((value) => value === null).length,
  });
}

export function generateFromCustomMask(shape, mask, { random } = {}) {
  if (!random) throw new TypeError('random is required.');
  const literals = new Map(mask?.literals ?? []);
  return [...String(shape ?? '')].map((character, index) => (
    literals.has(index) ? literals.get(index) : generatedCharacter(character, random)
  )).join('');
}

export function generateFromCustomPattern(sourceValue, { random, params } = {}) {
  const source = String(sourceValue ?? '');
  const mask = createCustomPatternMask(source, params);
  const shape = [...source].map((character) => {
    if (/\p{Lu}/u.test(character)) return 'A';
    if (/\p{Ll}/u.test(character)) return 'a';
    if (/\p{L}/u.test(character)) return 'L';
    if (/\p{N}/u.test(character)) return '9';
    return character;
  }).join('');
  let output = generateFromCustomMask(shape, mask, { random });
  for (let attempt = 0; output === source && attempt < 8; attempt += 1) {
    output = generateFromCustomMask(shape, mask, { random });
  }
  if (output === source) throw new RangeError('Custom pattern happened to reproduce the source value. Please generate a different part.');
  return output;
}

export function applyGeneratedAffixes(value, { prefix = '', suffix = '' } = {}) {
  const characters = [...String(value ?? '')];
  const prefixCharacters = [...String(prefix ?? '')];
  const suffixCharacters = [...String(suffix ?? '')];
  if (prefixCharacters.length > 0 && prefixCharacters.length <= characters.length) {
    characters.splice(0, prefixCharacters.length, ...prefixCharacters);
  }
  if (suffixCharacters.length > 0 && suffixCharacters.length <= characters.length) {
    characters.splice(characters.length - suffixCharacters.length, suffixCharacters.length, ...suffixCharacters);
  }
  return characters.join('');
}

export function generateFromShape(shape, { random } = {}) {
  if (!random) throw new TypeError('random is required.');
  return [...String(shape ?? '')].map((character) => {
    if (character === 'A' || character === 'L') return random.pick([...UPPER]);
    if (character === 'a') return random.pick([...LOWER]);
    if (character === '9') return random.pick([...DIGITS]);
    if (character === '␠') return ' ';
    return character;
  }).join('');
}

export function generateFromPattern(sourceValue, {
  random,
  prefix = '',
  suffix = '',
  preserveSafeAffixes = true,
} = {}) {
  if (!random) throw new TypeError('random is required.');
  const source = String(sourceValue ?? '');
  const retainedPrefix = preserveSafeAffixes ? safeAffix(prefix) : '';
  const retainedSuffix = preserveSafeAffixes ? safeAffix(suffix) : '';
  let output = [...source].map((character) => generatedCharacter(character, random)).join('');
  if (retainedPrefix && source.startsWith(retainedPrefix)) {
    output = retainedPrefix + output.slice(retainedPrefix.length);
  }
  if (retainedSuffix && source.endsWith(retainedSuffix)) {
    output = output.slice(0, -retainedSuffix.length) + retainedSuffix;
  }
  if (output === source) {
    const replaceIndex = [...source].findIndex((character) => /[\p{L}\p{N}]/u.test(character));
    if (replaceIndex >= 0) {
      const characters = [...output];
      const original = characters[replaceIndex];
      for (let attempt = 0; attempt < 8 && characters[replaceIndex] === original; attempt += 1) {
        characters[replaceIndex] = generatedCharacter(original, random);
      }
      output = characters.join('');
    }
  }
  return output;
}
