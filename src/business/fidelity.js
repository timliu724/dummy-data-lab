export const BUSINESS_FIDELITY_LEVELS = Object.freeze({
  FLEXIBLE: 'FLEXIBLE',
  BALANCED: 'BALANCED',
  HIGH: 'HIGH',
});

export const BUSINESS_FIDELITY_VALUES = Object.freeze(Object.values(BUSINESS_FIDELITY_LEVELS));
export const DEFAULT_BUSINESS_FIDELITY = BUSINESS_FIDELITY_LEVELS.BALANCED;

const LEVEL_DEFAULTS = Object.freeze({
  FLEXIBLE: Object.freeze({
    preserveRowOrder: false,
    preserveGroupRuns: false,
    preserveStableMappings: true,
    preserveCodeShape: false,
    preserveRelationships: false,
    preserveNumericRelationships: false,
    preserveNullPositions: false,
  }),
  BALANCED: Object.freeze({
    preserveRowOrder: false,
    preserveGroupRuns: true,
    preserveStableMappings: true,
    preserveCodeShape: true,
    preserveRelationships: true,
    preserveNumericRelationships: true,
    preserveNullPositions: true,
  }),
  HIGH: Object.freeze({
    preserveRowOrder: true,
    preserveGroupRuns: true,
    preserveStableMappings: true,
    preserveCodeShape: true,
    preserveRelationships: true,
    preserveNumericRelationships: true,
    preserveNullPositions: true,
  }),
});

export function normaliseBusinessFidelity(value) {
  const normalised = String(value ?? '').trim().toUpperCase();
  return BUSINESS_FIDELITY_VALUES.includes(normalised) ? normalised : DEFAULT_BUSINESS_FIDELITY;
}

export function defaultBusinessFidelitySettings(level = DEFAULT_BUSINESS_FIDELITY) {
  return Object.freeze({ ...LEVEL_DEFAULTS[normaliseBusinessFidelity(level)] });
}

export function normaliseBusinessFidelitySettings(level, settings = {}) {
  const defaults = LEVEL_DEFAULTS[normaliseBusinessFidelity(level)];
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    typeof source[key] === 'boolean' ? source[key] : fallback,
  ])));
}

export function businessFidelityModel(level = DEFAULT_BUSINESS_FIDELITY, settings = null) {
  const normalisedLevel = normaliseBusinessFidelity(level);
  const copy = {
    FLEXIBLE: Object.freeze({
      label: 'Independent',
      shortDescription: 'Generate each column separately with freedom to resize.',
      boundary: 'Columns are independent by default. Cross-field consistency, row order, groups, and blank positions may change unless you turn selected structure settings back on.',
      requiresInputRowCount: false,
    }),
    BALANCED: Object.freeze({
      label: 'Balanced',
      shortDescription: 'Keep useful patterns while still allowing a different output size.',
      boundary: 'Recommended. Preserves repeat mappings, formats, common groups, and confirmed relationships. Evidence-backed candidates stay off until you confirm them. Only High guarantees exact source order.',
      requiresInputRowCount: false,
    }),
    HIGH: Object.freeze({
      label: 'High match',
      shortDescription: 'Keep source order, group runs, and confirmed business relationships.',
      boundary: 'Uses the source row count for exact structure. Relationship candidates still require confirmation. Strong structure retention is pseudonymisation, not anonymisation.',
      requiresInputRowCount: true,
    }),
  }[normalisedLevel];
  return Object.freeze({
    level: normalisedLevel,
    ...copy,
    settings: normaliseBusinessFidelitySettings(normalisedLevel, settings ?? {}),
  });
}
