import { createAutoPatternMask, createCustomPatternMask } from '../generation/pattern-generator.js';
import { PATTERN_MODES } from '../policy/action-parameters.js';

const MAX_ESTIMATED_SPACE = 1_000_000_000_000_000;
const COLLISION_CONFIDENCE = 0.999;

function possibilities(character) {
  if (/\p{N}/u.test(character)) return 10;
  if (/\p{L}/u.test(character)) return 26;
  return 1;
}

function generatedIndexes(sourceValue, params) {
  const source = [...String(sourceValue ?? '')];
  const mode = params?.patternMode ?? PATTERN_MODES.AUTO;
  let mask = null;
  try {
    if (mode === PATTERN_MODES.CUSTOM) mask = createCustomPatternMask(source.join(''), params);
    else if (mode === PATTERN_MODES.AUTO) mask = createAutoPatternMask(source.join(''), params);
  } catch {
    return [];
  }
  if (mode === PATTERN_MODES.REGENERATE_ALL || mask === null) {
    return source.flatMap((character, index) => possibilities(character) > 1 ? [index] : []);
  }
  const literals = new Set((mask.literals ?? []).map(([index]) => index));
  return source.flatMap((character, index) => (
    !literals.has(index) && possibilities(character) > 1 ? [index] : []
  ));
}

export function estimatePatternValueSpace(sourceValue, params = {}) {
  const source = [...String(sourceValue ?? '')];
  const indexes = generatedIndexes(source.join(''), params);
  if (indexes.length === 0) return null;
  let space = 1;
  for (const index of indexes) {
    space *= possibilities(source[index]);
    if (space >= MAX_ESTIMATED_SPACE) return MAX_ESTIMATED_SPACE;
  }
  return space;
}

function poissonUpperQuantile(lambda, confidence = COLLISION_CONFIDENCE) {
  if (!(lambda > 0)) return 0;
  if (lambda > 50) return Math.ceil(lambda + 3.1 * Math.sqrt(lambda));
  let probability = Math.exp(-lambda);
  let cumulative = probability;
  let count = 0;
  while (cumulative < confidence && count < 10_000) {
    count += 1;
    probability *= lambda / count;
    cumulative += probability;
  }
  return count;
}

/**
 * Returns the number of distinct source collisions that are statistically
 * plausible for a finite PATTERN_REPLACE value space. Other replacement
 * actions stay strict because their effective provider space is not proven by
 * the structural evidence available to this validator.
 */
export function sourceReuseAllowance({ policy, sourceValues, outputDistinctCount }) {
  if (policy?.selectedAction !== 'PATTERN_REPLACE') {
    return Object.freeze({ allowance: 0, estimatedSpace: null, expectedCollisions: 0, basis: 'STRICT' });
  }
  if (policy.actionParams?.multiValueDetected || policy.actionParams?.multiValueMode === 'FORCE') {
    return Object.freeze({ allowance: 0, estimatedSpace: null, expectedCollisions: 0, basis: 'COMPLEX_PATTERN' });
  }
  const spaces = [...sourceValues]
    .map((value) => estimatePatternValueSpace(value, policy.actionParams))
    .filter((space) => Number.isFinite(space) && space > 1);
  if (spaces.length === 0) {
    return Object.freeze({ allowance: 0, estimatedSpace: null, expectedCollisions: 0, basis: 'UNPROVEN_SPACE' });
  }
  // Use the smallest supported space as a conservative upper estimate of
  // chance collisions. This permits collisions only when the format itself
  // makes them plausible; output row count alone never grants an exemption.
  const estimatedSpace = Math.min(...spaces);
  const collisionProbability = Math.min(1, sourceValues.size / estimatedSpace);
  const expectedCollisions = outputDistinctCount * collisionProbability;
  return Object.freeze({
    allowance: poissonUpperQuantile(expectedCollisions),
    estimatedSpace,
    expectedCollisions,
    basis: 'FINITE_PATTERN_SPACE',
  });
}
