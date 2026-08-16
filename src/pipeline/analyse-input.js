import { CandidateReservoir } from '../coverage/candidate-reservoir.js';
import { planCoverage } from '../coverage/coverage-planner.js';
import { extractCoverageScenarios } from '../coverage/scenario-extractor.js';
import { detectColumn } from '../detection/detector-registry.js';
import { parseDelimited } from '../input/parse-delimited.js';
import { recommendPolicies } from '../policy/recommend-policy.js';
import { createTableProfiler } from '../profile/profile-table.js';
import { proposeRelationships } from '../relationships/propose-relationships.js';
import { assessTableRisk } from '../risk/risk-engine.js';
import { createBusinessRelationshipProfiler } from '../business/relationship-profiler.js';

function reportProgress(callback, phase, message, current = null, total = null) {
  callback?.(Object.freeze({ phase, message, current, total }));
}

function applyParsedHeaders(tableProfile, parsedHeaders) {
  const columns = tableProfile.columns.map((profile, index) => Object.freeze({
    ...profile,
    columnName: parsedHeaders[index] || profile.columnName,
  }));
  return Object.freeze({ ...tableProfile, columns: Object.freeze(columns), columnCount: columns.length });
}

export function replanCoverage(analysis, requestedRowCount) {
  return planCoverage({
    scenarios: analysis.extraction.scenarios,
    candidates: analysis.candidates,
    matchedScenarioIds: analysis.candidateSummary?.matchedScenarioIds,
    scenarioRepresentativeLimitReached: analysis.candidateSummary?.scenarioRepresentativeLimitReached,
    requestedRowCount,
    inputRowCount: analysis.parseResult.rowCount,
  });
}

export async function analyseInput({
  input,
  parseOptions = {},
  recognitionOptions = {},
  requestedRowCount = 200,
  onProgress,
  chunkController = null,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
}) {
  if (input === null || input === undefined || input === '') throw new TypeError('An input file or pasted table is required.');
  const totalStartedAt = now();
  let profilingMs = 0;
  reportProgress(onProgress, 'PARSING', 'Scanning input and building bounded profiles…');
  const profiler = createTableProfiler();
  const parseStartedAt = now();
  const parseResult = await parseDelimited(input, {
    ...parseOptions,
    collectRows: false,
    onRow(row, context) {
      if (chunkController && !chunkController.checkpoint({
        phase: 'PARSING',
        rowCount: context.rowIndex,
        message: `Scanned ${context.rowIndex.toLocaleString()} rows…`,
      })) return false;
      const profileStartedAt = now();
      profiler.updateRow(row);
      profilingMs += now() - profileStartedAt;
      if (!chunkController && context.rowIndex > 0 && context.rowIndex % 5000 === 0) {
        reportProgress(onProgress, 'PARSING', `Scanned ${context.rowIndex.toLocaleString()} rows…`, context.rowIndex, null);
      }
      return true;
    },
  });
  chunkController?.throwIfCancelled();
  const parseAndProfileMs = now() - parseStartedAt;
  const tableProfile = applyParsedHeaders(profiler.finalize(), parseResult.headers);
  const headers = Object.freeze(tableProfile.columns.map((profile) => profile.columnName));

  reportProgress(onProgress, 'ANALYSING', 'Detecting column types, risks, and policies…');
  const detectionStartedAt = now();
  const recognitionAllowlist = Array.isArray(recognitionOptions.allowlist)
    ? recognitionOptions.allowlist
    : [];
  const detections = Object.freeze(tableProfile.columns.map((profile) => detectColumn(profile, {
    allowlist: recognitionAllowlist,
  })));
  const tableRisk = assessTableRisk({ tableProfile, detections });
  const policies = recommendPolicies({ tableProfile, detections, tableRisk });
  const headerRelationshipHints = proposeRelationships({ headers, detections });
  const businessRelationshipProfiler = createBusinessRelationshipProfiler({ headers, detections, policies });
  const extraction = extractCoverageScenarios({ tableProfile, detections, relationships: headerRelationshipHints });
  const detectionMs = now() - detectionStartedAt;

  reportProgress(onProgress, 'COVERAGE', 'Selecting bounded representative scenarios…');
  const coverageStartedAt = now();
  const reservoir = new CandidateReservoir({ capacity: 512, policies });
  await parseDelimited(input, {
    ...parseOptions,
    collectRows: false,
    onRow(row, context) {
      businessRelationshipProfiler.update(row);
      reservoir.offer(row, { sourceRowIndex: context.sourceRowIndex, matchers: extraction.matchers });
      if (chunkController && !chunkController.checkpoint({
        phase: 'COVERAGE',
        rowCount: context.rowIndex,
        total: parseResult.rowCount,
        message: `Selecting representative rows: ${context.rowIndex.toLocaleString()} scanned…`,
      })) return false;
      return true;
    },
  });
  chunkController?.throwIfCancelled();
  const businessRelationshipCandidates = businessRelationshipProfiler.finalize().rules;
  const relationshipProposals = Object.freeze([
    ...businessRelationshipCandidates,
    ...headerRelationshipHints,
  ]);
  const candidates = reservoir.snapshot();
  const candidateSummary = reservoir.publicSummary();
  const outputPlan = planCoverage({
    scenarios: extraction.scenarios,
    candidates,
    matchedScenarioIds: candidateSummary.matchedScenarioIds,
    scenarioRepresentativeLimitReached: candidateSummary.scenarioRepresentativeLimitReached,
    requestedRowCount,
    inputRowCount: parseResult.rowCount,
  });
  const coveragePlanningMs = now() - coverageStartedAt;
  const metrics = Object.freeze({
    parsingMs: Math.max(0, parseAndProfileMs - profilingMs),
    profilingMs,
    parseAndProfileMs,
    detectionMs,
    coveragePlanningMs,
    generationMs: 0,
    totalMs: now() - totalStartedAt,
  });
  reportProgress(onProgress, 'READY', 'Analysis complete.', parseResult.rowCount, parseResult.rowCount);
  return Object.freeze({
    headers,
    parseResult,
    tableProfile,
    detections,
    tableRisk,
    policies,
    relationshipProposals,
    extraction,
    candidates,
    candidateSummary,
    outputPlan,
    parseOptions: Object.freeze({ ...parseOptions }),
    recognitionSummary: Object.freeze({
      allowlistedValueCount: Math.min(100, recognitionAllowlist.length),
      recognisedAustralianIdentifierColumnCount: detections.filter((detection) => detection.type.startsWith('AU_')).length,
    }),
    metrics,
  });
}
