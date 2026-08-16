import { CandidateReservoir } from './candidate-reservoir.js';

/**
 * Scans rows once into a bounded candidate reservoir. The returned candidates
 * may contain policy-safe internal templates; only the coverage planner's
 * stripped references may enter OutputPlan.
 *
 * @param {Iterable<readonly unknown[]>|AsyncIterable<readonly unknown[]>} rows
 * @param {Object} options
 */
export async function collectRepresentativeRows(rows, { extraction, policies = [], limits = {} }) {
  if (!rows || (typeof rows[Symbol.iterator] !== 'function' && typeof rows[Symbol.asyncIterator] !== 'function')) {
    throw new TypeError('rows must be iterable.');
  }
  const reservoir = new CandidateReservoir({ ...limits, policies });
  let sourceRowIndex = 0;
  for await (const row of rows) {
    reservoir.offer(row, { sourceRowIndex, matchers: extraction.matchers });
    sourceRowIndex += 1;
  }
  return Object.freeze({
    candidates: reservoir.snapshot(),
    summary: reservoir.publicSummary(),
  });
}

/** @param {readonly object[]} candidates */
export function stripRepresentativeRows(candidates) {
  return Object.freeze(candidates.map((candidate) => Object.freeze({
    sourceRowIndex: candidate.sourceRowIndex,
    scenarioIds: Object.freeze([...candidate.scenarioIds]),
    coverageWeight: candidate.coverageWeight,
    representativenessScore: candidate.representativenessScore,
    distributionWeight: candidate.distributionWeight,
    priority: candidate.priority,
  })));
}
