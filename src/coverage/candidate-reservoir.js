import { valueShape } from '../detection/pattern-utils.js';
import { createTemplateDescriptor } from '../generation/template-descriptors.js';
import { BoundedCounter } from '../profile/bounded-counter.js';
import { stableHash32, truncateForTracking } from '../profile/value-normalization.js';

export const DEFAULT_CANDIDATE_LIMITS = Object.freeze({
  capacity: 512,
  maxColumns: 256,
  maxValueLength: 256,
});

/** @param {unknown} value @param {object|null} policy @param {number} maxLength */
export function policySafeTemplateValue(value, policy, maxLength = DEFAULT_CANDIDATE_LIMITS.maxValueLength) {
  const text = value === null || value === undefined ? '' : String(value);
  const action = policy?.selectedAction ?? null;
  if (action === 'DROP') return null;
  if (action === 'CLEAR') return '';
  if (['REPLACE', 'PATTERN_REPLACE', 'GENERALISE', 'TEXT_SANITISE'].includes(action)) {
    try {
      return createTemplateDescriptor(action, text, {
        actionParams: policy?.actionParams,
        detectedType: policy?.detectedType,
        columnName: policy?.columnName,
      });
    } catch (error) {
      throw new RangeError(`Template preparation failed for column "${policy?.columnName ?? 'unknown'}": ${error.message}`);
    }
  }
  return truncateForTracking(text, maxLength).value;
}

export function createPolicySafeTemplateRow(row, policies = [], {
  maxColumns = DEFAULT_CANDIDATE_LIMITS.maxColumns,
  maxValueLength = DEFAULT_CANDIDATE_LIMITS.maxValueLength,
} = {}) {
  if (!Array.isArray(row)) throw new TypeError('row must be an array.');
  return Object.freeze(row.slice(0, maxColumns).map((value, columnIndex) => policySafeTemplateValue(
    value,
    policies[columnIndex] ?? null,
    maxValueLength,
  )));
}

/** @param {readonly unknown[]} row */
function rowFeatureSignature(row) {
  return row.map((value) => {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (text === '') return 'E';
    const lengthBucket = Math.min(9, Math.floor(text.length / 8));
    return `${valueShape(text).slice(0, 24)}:${lengthBucket}`;
  }).join('|');
}

/** @param {object} left @param {object} right */
function compareCandidateQuality(left, right) {
  return right.scenarioIds.length - left.scenarioIds.length
    || right.coverageWeight - left.coverageWeight
    || right.representativenessScore - left.representativenessScore
    || left.priority - right.priority
    || left.sourceRowIndex - right.sourceRowIndex;
}

export class CandidateReservoir {
  /** @param {Object} [options] */
  constructor({ capacity = 512, maxColumns = 256, maxValueLength = 256, policies = [] } = {}) {
    for (const [name, value] of Object.entries({ capacity, maxColumns, maxValueLength })) {
      if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`);
    }
    this.limits = Object.freeze({ capacity, maxColumns, maxValueLength });
    this.policies = policies;
    this.candidates = [];
    this.scenarioRepresentatives = new Map();
    this.matchedScenarioIds = new Set();
    this.scenarioRepresentativeLimitReached = false;
    this.featureCounts = new BoundedCounter(capacity);
    this.seenRowCount = 0;
    this.replacementCount = 0;
  }

  /** @param {readonly unknown[]} row @param {Object} [options] */
  offer(row, { sourceRowIndex = this.seenRowCount, matchers = [] } = {}) {
    if (!Array.isArray(row)) throw new TypeError('row must be an array.');
    if (!Number.isInteger(sourceRowIndex) || sourceRowIndex < 0) throw new RangeError('sourceRowIndex must be non-negative.');
    this.seenRowCount += 1;
    const boundedRow = row.slice(0, this.limits.maxColumns);
    const matched = matchers.filter((matcher) => matcher.match(row));
    const scenarioIds = Object.freeze(matched.map((matcher) => matcher.scenarioId));
    const coverageWeight = matched.reduce((sum, matcher) => sum + (matcher.scenario.weight ?? matcher.scenario.priority ?? 1), 0);
    const nonEmptyRatio = boundedRow.length === 0 ? 0 : boundedRow.filter((value) => String(value ?? '').trim() !== '').length / boundedRow.length;
    const signature = `${rowFeatureSignature(boundedRow)}|${scenarioIds.join(',')}`;
    this.featureCounts.increment(signature);
    const hashPriority = stableHash32(`${sourceRowIndex}|${signature}`) / 0xffffffff;
    const priority = hashPriority / (1 + coverageWeight * 0.02);
    const template = createPolicySafeTemplateRow(boundedRow, this.policies, this.limits);
    const candidate = Object.freeze({
      sourceRowIndex,
      scenarioIds,
      coverageWeight,
      representativenessScore: nonEmptyRatio * 10 + scenarioIds.length,
      distributionWeight: 1,
      priority,
      featureSignature: signature,
      template,
    });

    for (const matcher of matched) {
      const scenarioId = matcher.scenarioId;
      this.matchedScenarioIds.add(scenarioId);
      const current = this.scenarioRepresentatives.get(scenarioId);
      if (current) {
        if (compareCandidateQuality(candidate, current) < 0) {
          this.scenarioRepresentatives.set(scenarioId, candidate);
        }
      } else if (this.scenarioRepresentatives.size < this.limits.capacity) {
        this.scenarioRepresentatives.set(scenarioId, candidate);
      } else {
        this.scenarioRepresentativeLimitReached = true;
      }
    }

    if (this.candidates.length < this.limits.capacity) {
      this.candidates.push(candidate);
      return;
    }
    let worstIndex = 0;
    for (let index = 1; index < this.candidates.length; index += 1) {
      if (this.candidates[index].priority > this.candidates[worstIndex].priority) worstIndex = index;
    }
    if (candidate.priority < this.candidates[worstIndex].priority) {
      this.candidates[worstIndex] = candidate;
      this.replacementCount += 1;
    }
  }

  snapshot() {
    const distributionWeights = new Map(
      this.featureCounts.snapshot(this.limits.capacity).map((entry) => [entry.value, entry.count]),
    );
    const combined = new Map();
    for (const candidate of this.scenarioRepresentatives.values()) {
      combined.set(candidate.sourceRowIndex, candidate);
    }
    for (const candidate of [...this.candidates].sort(compareCandidateQuality)) {
      if (combined.size >= this.limits.capacity) break;
      if (!combined.has(candidate.sourceRowIndex)) combined.set(candidate.sourceRowIndex, candidate);
    }
    return Object.freeze([...combined.values()].map((candidate) => Object.freeze({
      ...candidate,
      distributionWeight: distributionWeights.get(candidate.featureSignature) ?? 1,
    })).sort(
      compareCandidateQuality,
    ));
  }

  publicSummary() {
    const retained = this.snapshot();
    const representedScenarioIds = new Set(retained.flatMap((candidate) => candidate.scenarioIds));
    const unrepresentedMatchedScenarioIds = [...this.matchedScenarioIds]
      .filter((scenarioId) => !representedScenarioIds.has(scenarioId));
    return Object.freeze({
      seenRowCount: this.seenRowCount,
      retainedCandidateCount: retained.length,
      replacementCount: this.replacementCount,
      trackedFeatureSignatures: this.featureCounts.size,
      featureDistributionStatus: this.featureCounts.status,
      matchedScenarioCount: this.matchedScenarioIds.size,
      representedScenarioCount: representedScenarioIds.size,
      matchedScenarioIds: Object.freeze([...this.matchedScenarioIds]),
      unrepresentedMatchedScenarioIds: Object.freeze(unrepresentedMatchedScenarioIds),
      scenarioRepresentativeLimitReached: this.scenarioRepresentativeLimitReached,
      limits: this.limits,
    });
  }
}
