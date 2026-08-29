import { summarizeGenerationWarnings } from './generation-feedback.js';

export function renderGenerationValidation(container, result, { probe = false, hidePassing = false } = {}) {
  container.replaceChildren();
  if (!result) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const allWarningMessages = summarizeGenerationWarnings(result.warnings, Number.MAX_SAFE_INTEGER);
  const warningMessages = allWarningMessages.slice(0, 4);
  const strongWarningCodes = new Set(['OUTPUT_UNIQUENESS_VIOLATION', 'GENERATED_UNIQUENESS_RELAXED', 'GENERATED_UNIQUENESS_VIOLATION']);
  const failed = !result.validation.valid || (result.warnings ?? []).some((warning) => strongWarningCodes.has(warning.code));
  const needsReview = !failed && allWarningMessages.length > 0;
  if (hidePassing && !failed && !needsReview) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.className = `generation-validation ${failed ? 'generation-validation--invalid' : needsReview ? 'generation-validation--review' : 'generation-validation--valid'}`;
  const heading = document.createElement('strong');
  heading.textContent = failed
    ? `${probe ? 'Probe' : 'Output'} validation failed`
    : !needsReview
    ? `${probe ? 'Probe' : 'Output'} validation passed`
    : `${probe ? 'Probe' : 'Output'} checks need review`;
  const details = document.createElement('span');
  details.textContent = `${result.rows.length.toLocaleString()} rows · ${result.headers.length} columns · ${result.validation.issueCount ?? result.issues.length} issues${allWarningMessages.length > 0 ? ` · ${allWarningMessages.length} review notes` : ''}`;
  const boundary = document.createElement('small');
  boundary.textContent = probe
    ? 'This is a non-exportable test run. Generate the full requested output after reviewing it.'
    : failed
      ? 'A declared result-level contract failed. Inspect the issues before use.'
      : !needsReview
      ? 'Automated checks found no result-level issues.'
      : 'Use Compare with source when a review note matters to your use case.';
  container.append(heading, details, boundary);
  if (warningMessages.length > 0) {
    const warningList = document.createElement('ul');
    warningList.className = 'generation-validation__warnings';
    warningList.setAttribute('aria-label', 'Output review notes');
    for (const message of warningMessages) {
      const item = document.createElement('li');
      item.textContent = message;
      warningList.append(item);
    }
    container.append(warningList);
  }
}
