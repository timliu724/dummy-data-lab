import { REPLACEMENT_BEHAVIORS } from '../policy/action-parameters.js';

/**
 * Builds an internal mapping identity without exposing the source value.
 *
 * AUTO keeps real source occurrences consistent, but allows a deliberately
 * reused output template to represent a new synthetic entity. CONSISTENT
 * always reuses the mapping. INDEPENDENT creates a new mapping per output row.
 */
export function replacementIdentityKey({
  sourceIdentity,
  entityKey = 'output-row',
  forceUniqueInstance = false,
  repeatHandling = REPLACEMENT_BEHAVIORS.AUTO,
  hasSourceIdentity = true,
}) {
  if (!Object.values(REPLACEMENT_BEHAVIORS).includes(repeatHandling)) {
    throw new RangeError(`Unsupported repeat handling: ${repeatHandling}.`);
  }
  const original = String(sourceIdentity ?? '');
  const instance = String(entityKey || 'output-row');
  if (repeatHandling === REPLACEMENT_BEHAVIORS.CONSISTENT) return original;
  if (repeatHandling === REPLACEMENT_BEHAVIORS.INDEPENDENT) return `${original}\u0000independent:${instance}`;
  return forceUniqueInstance || !hasSourceIdentity
    ? `${original}\u0000auto-instance:${instance}`
    : original;
}
