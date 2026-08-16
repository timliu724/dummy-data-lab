function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`);
}

const CATEGORY_STRATIFICATION_TYPES = new Set(['CATEGORY', 'BOOLEAN']);
const STRATA_FEATURE_LIMIT = 24;
const STRATA_CAPTURE_BUDGET_FACTOR = 2;
const MINIMUM_CATEGORY_TARGET = 2;

function normalizedText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function finitePopulationCountInterval({ sourceCount, sourceRowCount, targetRowCount, standardDeviations = 3 } = {}) {
  if (!Number.isInteger(sourceCount) || sourceCount < 0) throw new RangeError('sourceCount must be a non-negative integer.');
  requirePositiveInteger(sourceRowCount, 'sourceRowCount');
  requirePositiveInteger(targetRowCount, 'targetRowCount');
  if (sourceCount > sourceRowCount) throw new RangeError('sourceCount cannot exceed sourceRowCount.');
  if (targetRowCount > sourceRowCount) throw new RangeError('targetRowCount cannot exceed sourceRowCount.');
  if (!Number.isFinite(standardDeviations) || standardDeviations <= 0) {
    throw new RangeError('standardDeviations must be positive.');
  }
  const rate = sourceCount / sourceRowCount;
  const expected = targetRowCount * rate;
  const correction = sourceRowCount <= 1
    ? 0
    : (sourceRowCount - targetRowCount) / (sourceRowCount - 1);
  const standardError = Math.sqrt(Math.max(0, targetRowCount * rate * (1 - rate) * correction));
  return Object.freeze({
    expected,
    target: Math.round(expected),
    lower: Math.max(0, Math.floor(expected - standardDeviations * standardError - 0.5)),
    upper: Math.min(targetRowCount, Math.ceil(expected + standardDeviations * standardError + 0.5)),
    sourceRate: rate,
    standardError,
    standardDeviations,
  });
}

export function balancedIndexPreference(rowCount, targetCount, { preserveContiguousBlocks = true } = {}) {
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new RangeError('rowCount must be a non-negative integer.');
  requirePositiveInteger(targetCount, 'targetCount');
  if (rowCount === 0) return Object.freeze([]);
  if (targetCount >= rowCount) return Object.freeze(Array.from({ length: rowCount }, (_, index) => index));
  if (!preserveContiguousBlocks) {
    const selected = new Set();
    for (let slot = 0; slot < targetCount; slot += 1) {
      selected.add(Math.min(rowCount - 1, Math.floor((slot + 0.5) * rowCount / targetCount)));
    }
    for (let index = 0; index < rowCount && selected.size < targetCount; index += 1) selected.add(index);
    return Object.freeze([...selected]);
  }

  const blockSize = Math.min(24, Math.max(4, Math.round(Math.sqrt(targetCount))));
  const blockCount = Math.max(1, Math.ceil(targetCount / blockSize));
  const selected = new Set();
  for (let blockIndex = 0; blockIndex < blockCount && selected.size < targetCount; blockIndex += 1) {
    const progress = blockCount === 1 ? 0.5 : blockIndex / (blockCount - 1);
    const start = Math.round(progress * Math.max(0, rowCount - blockSize));
    for (let offset = 0; offset < blockSize && selected.size < targetCount; offset += 1) {
      selected.add(Math.min(rowCount - 1, start + offset));
    }
  }
  if (selected.size < targetCount) {
    for (let slot = 0; slot < targetCount && selected.size < targetCount; slot += 1) {
      selected.add(Math.min(rowCount - 1, Math.floor((slot + 0.5) * rowCount / targetCount)));
    }
  }
  if (selected.size < targetCount) {
    for (let index = 0; index < rowCount && selected.size < targetCount; index += 1) selected.add(index);
  }
  return Object.freeze([...selected]);
}

export function createBalancedStrataPlan({
  profiles = [],
  detections = [],
  policies = [],
  requestedRowCount,
  preserveNullPositions = true,
  maximumFeatures = STRATA_FEATURE_LIMIT,
} = {}) {
  requirePositiveInteger(requestedRowCount, 'requestedRowCount');
  requirePositiveInteger(maximumFeatures, 'maximumFeatures');
  const observedRowCount = profiles.find((profile) => Number.isInteger(profile?.observedRowCount))?.observedRowCount ?? 0;
  if (observedRowCount <= 0 || requestedRowCount >= observedRowCount) return Object.freeze([]);
  const candidates = [];
  for (let columnIndex = 0; columnIndex < profiles.length; columnIndex += 1) {
    const profile = profiles[columnIndex] ?? {};
    const policy = policies[columnIndex] ?? {};
    if (['DROP', 'CLEAR'].includes(policy.selectedAction)) continue;
    if (preserveNullPositions && profile.emptyCount > 0 && profile.emptyCount < observedRowCount) {
      const interval = finitePopulationCountInterval({
        sourceCount: profile.emptyCount,
        sourceRowCount: observedRowCount,
        targetRowCount: requestedRowCount,
      });
      if (interval.target > 0) candidates.push({
        columnIndex,
        kind: 'EMPTY',
        value: null,
        sourceCount: profile.emptyCount,
        ...interval,
        priority: 0,
      });
    }
    const detectionType = detections[columnIndex]?.type ?? policy.detectedType;
    const lowCardinalityEvidence = Number.isInteger(profile.uniqueCount)
      && profile.uniqueCount >= 2
      && profile.uniqueCount <= Math.min(20, Math.max(2, Math.ceil(Math.sqrt(profile.nonEmptyCount ?? observedRowCount))))
      && (profile.uniqueRatio ?? 1) <= 0.1;
    const completeCategorySupport = (CATEGORY_STRATIFICATION_TYPES.has(detectionType) || lowCardinalityEvidence)
      && profile.uniqueCountStatus === 'EXACT'
      && profile.measurementStatus?.topValues === 'EXACT'
      && profile.uniqueCount <= (profile.topValues?.length ?? 0);
    if (!completeCategorySupport) continue;
    for (const entry of profile.topValues ?? []) {
      const value = normalizedText(entry.value);
      if (!value || entry.count <= 0 || entry.count > observedRowCount / 2) continue;
      const interval = finitePopulationCountInterval({
        sourceCount: entry.count,
        sourceRowCount: observedRowCount,
        targetRowCount: requestedRowCount,
      });
      if (interval.target < MINIMUM_CATEGORY_TARGET) continue;
      candidates.push({
        columnIndex,
        kind: 'MINORITY_CATEGORY',
        value,
        sourceCount: entry.count,
        ...interval,
        priority: 1,
      });
    }
  }
  candidates.sort((left, right) => left.priority - right.priority
    || left.target - right.target
    || left.columnIndex - right.columnIndex
    || String(left.value ?? '').localeCompare(String(right.value ?? '')));
  const captureBudget = requestedRowCount * STRATA_CAPTURE_BUDGET_FACTOR;
  const selected = [];
  let plannedCaptures = 0;
  for (const candidate of candidates) {
    if (selected.length >= maximumFeatures) break;
    if (selected.length > 0 && plannedCaptures + candidate.target > captureBudget) continue;
    const id = `balanced-stratum-${selected.length + 1}`;
    selected.push(Object.freeze({
      ...candidate,
      id,
      captureOrdinals: Object.freeze(balancedIndexPreference(
        candidate.sourceCount,
        candidate.target,
        { preserveContiguousBlocks: false },
      )),
    }));
    plannedCaptures += candidate.target;
  }
  return Object.freeze(selected);
}

export function createBalancedStrataTracker(strata = []) {
  if (!Array.isArray(strata)) throw new TypeError('strata must be an array.');
  const occurrenceCounts = new Map(strata.map((feature) => [feature.id, 0]));
  const captureSets = new Map(strata.map((feature) => [feature.id, new Set(feature.captureOrdinals)]));
  return Object.freeze({
    inspect(row) {
      if (!Array.isArray(row)) throw new TypeError('row must be an array.');
      const featureIds = [];
      let capture = false;
      for (const feature of strata) {
        const text = normalizedText(row[feature.columnIndex]);
        const matches = feature.kind === 'EMPTY' ? text === '' : text === feature.value;
        if (!matches) continue;
        const ordinal = occurrenceCounts.get(feature.id) ?? 0;
        occurrenceCounts.set(feature.id, ordinal + 1);
        featureIds.push(feature.id);
        if (captureSets.get(feature.id)?.has(ordinal)) capture = true;
      }
      return Object.freeze({ featureIds: Object.freeze(featureIds), capture });
    },
  });
}

export function chooseBalancedEntries({
  capturedEntries,
  preferredDataRowIndexes,
  mandatorySourceRowIndexes = [],
  requestedRowCount,
  balancedStrata = [],
}) {
  if (!Array.isArray(capturedEntries)) throw new TypeError('capturedEntries must be an array.');
  requirePositiveInteger(requestedRowCount, 'requestedRowCount');
  const byDataIndex = new Map(capturedEntries.map((entry) => [entry.dataRowIndex, entry]));
  const bySourceIndex = new Map(capturedEntries.map((entry) => [entry.sourceRowIndex, entry]));
  const selected = new Map();
  const targetByFeature = new Map(balancedStrata.map((feature) => [feature.id, feature.target]));
  const selectedFeatureCounts = new Map(balancedStrata.map((feature) => [feature.id, 0]));
  const addEntry = (entry) => {
    if (!entry || selected.has(entry.dataRowIndex) || selected.size >= requestedRowCount) return false;
    selected.set(entry.dataRowIndex, entry);
    for (const featureId of entry.balancedStrataIds ?? []) {
      if (selectedFeatureCounts.has(featureId)) {
        selectedFeatureCounts.set(featureId, selectedFeatureCounts.get(featureId) + 1);
      }
    }
    return true;
  };
  const fitsTargets = (entry) => (entry.balancedStrataIds ?? []).every((featureId) => (
    !targetByFeature.has(featureId)
    || selectedFeatureCounts.get(featureId) < targetByFeature.get(featureId)
  ));
  for (const sourceRowIndex of mandatorySourceRowIndexes) {
    const entry = bySourceIndex.get(sourceRowIndex);
    addEntry(entry);
    if (selected.size >= requestedRowCount) break;
  }
  for (const feature of balancedStrata) {
    const matching = capturedEntries
      .filter((entry) => (entry.balancedStrataIds ?? []).includes(feature.id))
      .sort((left, right) => {
        const unmetBenefits = (entry) => (entry.balancedStrataIds ?? []).filter((featureId) => (
          targetByFeature.has(featureId)
          && selectedFeatureCounts.get(featureId) < targetByFeature.get(featureId)
        )).length;
        return unmetBenefits(right) - unmetBenefits(left)
          || left.dataRowIndex - right.dataRowIndex;
      });
    for (const entry of matching) {
      if ((selectedFeatureCounts.get(feature.id) ?? 0) >= feature.target) break;
      if (fitsTargets(entry)) addEntry(entry);
    }
    for (const entry of matching) {
      if ((selectedFeatureCounts.get(feature.id) ?? 0) >= feature.target) break;
      addEntry(entry);
    }
  }
  for (const dataRowIndex of preferredDataRowIndexes) {
    const entry = byDataIndex.get(dataRowIndex);
    if (entry && fitsTargets(entry)) addEntry(entry);
    if (selected.size >= Math.min(requestedRowCount, byDataIndex.size)) break;
  }
  for (const entry of capturedEntries) {
    if (fitsTargets(entry)) addEntry(entry);
    if (selected.size >= Math.min(requestedRowCount, byDataIndex.size)) break;
  }
  for (const dataRowIndex of preferredDataRowIndexes) {
    addEntry(byDataIndex.get(dataRowIndex));
    if (selected.size >= Math.min(requestedRowCount, byDataIndex.size)) break;
  }
  for (const entry of capturedEntries) {
    addEntry(entry);
    if (selected.size >= Math.min(requestedRowCount, byDataIndex.size)) break;
  }
  return Object.freeze([...selected.values()]
    .sort((left, right) => left.dataRowIndex - right.dataRowIndex)
    .map((entry) => Object.freeze({ ...entry, row: Object.freeze([...entry.row]) })));
}
