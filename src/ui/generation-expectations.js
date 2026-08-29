const REROLLING_ACTIONS = new Set(['REPLACE', 'PATTERN_REPLACE', 'RESAMPLE', 'GENERATE']);

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

function joinFacts(facts) {
  if (facts.length <= 1) return facts[0] ?? '';
  return `${facts.slice(0, -1).join(', ')} and ${facts.at(-1)}`;
}

function actionCanReroll(column) {
  const action = String(column?.selectedAction ?? '').toUpperCase();
  if (REROLLING_ACTIONS.has(action)) return true;
  return action === 'SHIFT' && String(column?.actionParams?.offsetMode ?? '').toUpperCase() === 'RANDOM_ONCE';
}

export function generationVariationModel(columns = []) {
  if (!Array.isArray(columns)) throw new TypeError('columns must be an array.');
  const outputColumns = columns.filter((column) => String(column?.selectedAction ?? '').toUpperCase() !== 'DROP');
  const rerollingCount = outputColumns.filter(actionCanReroll).length;
  const repeatableCount = outputColumns.length - rerollingCount;
  let text;
  let kind;
  if (outputColumns.length === 0) {
    kind = 'empty';
    text = 'Choose at least one output column before generating.';
  } else if (rerollingCount === 0) {
    kind = 'repeatable';
    text = 'Every selected action is repeatable, so another run can produce the same values.';
  } else if (repeatableCount === 0) {
    kind = 'rerolling';
    text = `All ${plural(rerollingCount, 'column')} can create a new version on another run.`;
  } else {
    kind = 'mixed';
    const fixedVerb = repeatableCount === 1 ? 'uses' : 'use';
    text = `${plural(rerollingCount, 'column')} can change on another run; ${plural(repeatableCount, 'column')} ${fixedVerb} fixed actions and may stay the same.`;
  }
  return Object.freeze({ kind, rerollingCount, repeatableCount, text });
}

export function businessFidelityImpactModel({
  level = 'BALANCED',
  settings = {},
  analysis = null,
  activeRelationshipCount = 0,
} = {}) {
  const normalisedLevel = String(level).toUpperCase();
  const rowCount = analysis?.parseResult?.rowCount ?? null;
  const profiles = Array.isArray(analysis?.tableProfile?.columns) ? analysis.tableProfile.columns : [];
  const blankColumnCount = profiles.filter((profile) => (profile?.emptyCount ?? 0) > 0 || (profile?.nullCount ?? 0) > 0).length;
  const relationshipCount = Math.max(0, Number.isInteger(activeRelationshipCount) ? activeRelationshipCount : 0);

  if (!analysis) {
    const text = normalisedLevel === 'FLEXIBLE'
      ? 'Analyse a table to see which source structures can change.'
      : normalisedLevel === 'HIGH'
        ? 'Analyse a table to match its complete row sequence and source row count.'
        : 'Analyse a table to see which useful structures can be retained.';
    return Object.freeze({ text, rowCount, blankColumnCount, relationshipCount });
  }

  const kept = [];
  if (settings.preserveRowOrder) kept.push('source row order');
  if (settings.preserveGroupRuns) kept.push('consecutive groups');
  if (settings.preserveStableMappings) kept.push('repeat mappings');
  if (settings.preserveCodeShape) kept.push('code shapes');
  if (settings.preserveNullPositions && blankColumnCount > 0) {
    kept.push(`blank positions in ${plural(blankColumnCount, 'column')}`);
  }
  if ((settings.preserveRelationships || settings.preserveNumericRelationships) && relationshipCount > 0) {
    kept.push(plural(relationshipCount, 'confirmed rule'));
  }

  let text;
  if (normalisedLevel === 'FLEXIBLE') {
    text = `Mixes ${plural(rowCount, 'source row')} freely. ${kept.length ? `Keeps ${joinFacts(kept)}; ` : ''}row order, groups and blank positions may change.`;
  } else if (normalisedLevel === 'HIGH') {
    text = `Uses all ${plural(rowCount, 'source row')} in source order. ${kept.length ? `Keeps ${joinFacts(kept)}. ` : ''}Output size is locked to the source.`;
  } else {
    text = `${kept.length ? `Keeps ${joinFacts(kept)}.` : 'No source structures are currently retained.'} Source row order can still change.`;
    if (blankColumnCount === 0 && relationshipCount === 0) {
      text += ' This file has no blank patterns or confirmed rules, so the difference from Flexible may be subtle.';
    }
  }
  return Object.freeze({ text, rowCount, blankColumnCount, relationshipCount });
}
