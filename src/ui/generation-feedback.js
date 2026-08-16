const ISSUE_LABELS = Object.freeze({
  OUTPUT_UNIQUENESS_VIOLATION: 'uniqueness collisions',
  OUTPUT_TYPE_MISMATCH: 'type/format mismatches',
  OUTPUT_PATTERN_MISMATCH: 'pattern mismatches',
  BUSINESS_RELATIONSHIP_VIOLATION: 'confirmed business relationship violations',
  DATE_RELATIONSHIP_VIOLATION: 'date-order violations',
  SHIFT_GROUP_ORDER_VIOLATION: 'Shift Group order violations',
  SAME_ID_RELATIONSHIP_VIOLATION: 'same-ID relationship violations',
  CODE_DESCRIPTION_VIOLATION: 'code/description violations',
  OUTPUT_SCHEMA_MISMATCH: 'schema mismatches',
  INTERNAL_TEMPLATE_LEAK: 'internal template leaks',
});

const QUIET_ROUTINE_WARNING_CODES = new Set([
  'OUTPUT_BOUNDED_VOCABULARY_REUSE',
  'OUTPUT_SOURCE_VALUE_CHANCE_COLLISION',
  'OUTPUT_HIGH_DUPLICATE_RATE',
  'TEMPLATE_REUSE_REQUIRED',
]);

function ratioText(count, total) {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return `${Number(count ?? 0).toLocaleString()} rows`;
  const percentage = Number(((count / total) * 100).toFixed(count / total < 0.01 ? 2 : 1));
  return `${count.toLocaleString()} of ${total.toLocaleString()} rows (${percentage}%)`;
}

export function summarizeValidationIssues(issues, maximumGroups = 4, totalRows = null) {
  const groups = new Map();
  for (const issue of issues ?? []) {
    const column = issue.details?.columnName ?? null;
    const key = `${issue.code}|${column ?? ''}|${issue.details?.relationshipId ?? ''}`;
    const current = groups.get(key) ?? { code: issue.code, column, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }
  const ordered = [...groups.values()].sort((left, right) => right.count - left.count);
  const visible = ordered.slice(0, maximumGroups).map((group) => {
    const label = ISSUE_LABELS[group.code] ?? group.code.toLocaleLowerCase().replaceAll('_', ' ');
    const amount = Number.isFinite(totalRows) ? ratioText(group.count, totalRows) : group.count.toLocaleString();
    return `${amount} ${label}${group.column ? ` in ${group.column}` : ''}`;
  });
  const hidden = ordered.length - visible.length;
  return `${visible.join('; ')}${hidden > 0 ? `; plus ${hidden} other issue groups` : ''}`;
}

export function summarizeGenerationWarnings(warnings, maximumGroups = 4) {
  const groups = new Map();
  for (const warning of warnings ?? []) {
    if (QUIET_ROUTINE_WARNING_CODES.has(warning.code)) continue;
    const ratioWarning = [
      'OUTPUT_SOURCE_VALUE_REUSE',
      'OUTPUT_INFERRED_UNIQUENESS_RELAXED',
      'OUTPUT_UNIQUENESS_VIOLATION',
      'GENERATED_UNIQUENESS_RELAXED',
    ].includes(warning.code);
    const key = ratioWarning
      ? `${warning.code}:${warning.details?.columnName ?? ''}`
      : warning.code ?? warning.message;
    const missingScenarioCount = warning.details?.missingScenarioIds?.length ?? null;
    const reusedRowCount = Number(warning.details?.reusedRowCount);
    const duplicateRowCount = Number(warning.details?.duplicateRowCount);
    const nonEmptyCount = Number(warning.details?.nonEmptyCount);
    const reusedDistinctCount = Number(warning.details?.reusedDistinctCount ?? 0);
    const columnName = warning.details?.columnName ?? 'this column';
    const message = warning.code === 'OUTPUT_SOURCE_VALUE_REUSE'
      && Number.isFinite(reusedRowCount) && Number.isFinite(nonEmptyCount)
      ? `${columnName} contains ${reusedDistinctCount.toLocaleString()} ${reusedDistinctCount === 1 ? 'value' : 'values'} also found in the source, affecting ${ratioText(reusedRowCount, nonEmptyCount)}.`
      : ['OUTPUT_INFERRED_UNIQUENESS_RELAXED', 'OUTPUT_UNIQUENESS_VIOLATION', 'GENERATED_UNIQUENESS_RELAXED'].includes(warning.code)
        && Number.isFinite(duplicateRowCount) && Number.isFinite(nonEmptyCount)
        ? `${columnName} contains values repeated from an earlier row in ${ratioText(duplicateRowCount, nonEmptyCount)}.`
      : warning.code === 'EXPLICIT_UNIQUENESS_CAPACITY_RELAXED'
        ? `${columnName} has only ${Number(warning.details?.availableUniqueValues ?? 0).toLocaleString()} distinct source values for ${Number(warning.details?.requestedRowCount ?? 0).toLocaleString()} rows, so at least ${Math.max(0, Number(warning.details?.requestedRowCount ?? 0) - Number(warning.details?.availableUniqueValues ?? 0)).toLocaleString()} rows repeat.`
      : warning.code === 'MAPPING_UNIQUENESS_RELAXED'
        ? `Generated mappings repeat in ${ratioText(Number(warning.details?.relaxedCollisionCount ?? 0), Number(warning.details?.outputRowCount ?? 0))} after the distinct replacement pool was exhausted.`
      : warning.code === 'SCENARIOS_MAY_BE_MISSING' && missingScenarioCount !== null
      ? `${missingScenarioCount} representable scenarios were left out because the requested output is too small.`
      : warning.code === 'SCENARIOS_UNAVAILABLE_IN_BOUNDED_TEMPLATES' && missingScenarioCount !== null
        ? `${missingScenarioCount} detected test cases have no safe source row. Adding output rows will not fix this.`
      : warning.message;
    const current = groups.get(key) ?? { message, columns: new Set(), count: 0, ratioWarning };
    current.count += 1;
    if (warning.details?.columnName) current.columns.add(warning.details.columnName);
    groups.set(key, current);
  }
  const orderedGroups = [...groups.values()].sort(
    (left, right) => Number(right.ratioWarning) - Number(left.ratioWarning),
  );
  return Object.freeze(orderedGroups.slice(0, maximumGroups).map((group) => {
    const columns = [...group.columns];
    return `${group.message}${!group.ratioWarning && columns.length ? ` Columns: ${columns.join(', ')}.` : ''}${group.count > 1 && columns.length === 0 ? ` (${group.count} occurrences)` : ''}`;
  }));
}
