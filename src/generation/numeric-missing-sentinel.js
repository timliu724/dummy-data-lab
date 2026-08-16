const NUMERIC_TYPES = new Set(['INTEGER', 'DECIMAL', 'PERCENTAGE', 'CURRENCY_LIKE']);
const SUPPORTED_NUMERIC_MISSING_SENTINELS = new Set([
  'N/A', 'NA', 'NULL', 'NONE', 'UNKNOWN', '-', '--', 'NOT AVAILABLE',
]);

function normaliseSentinel(value) {
  return String(value ?? '').trim().toLocaleUpperCase();
}

function profileValues(profile) {
  return [
    ...(profile?.sampleValues ?? []),
    ...(profile?.topValues ?? []).map((entry) => entry?.value),
  ];
}

export function isSupportedNumericMissingSentinel(value) {
  return SUPPORTED_NUMERIC_MISSING_SENTINELS.has(normaliseSentinel(value));
}

export function isRecognisedNumericMissingSentinel({
  value,
  policy,
  profile = null,
  sourceValueObserved = false,
}) {
  if (policy?.selectedAction !== 'RESAMPLE') return false;
  const numericColumn = NUMERIC_TYPES.has(policy.detectedType) || (profile?.numericStats?.count ?? 0) > 0;
  if (!numericColumn || !isSupportedNumericMissingSentinel(value)) return false;
  if (sourceValueObserved) return true;
  const token = normaliseSentinel(value);
  return profileValues(profile).some((entry) => normaliseSentinel(entry) === token);
}
