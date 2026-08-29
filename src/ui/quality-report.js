import { createInfoTooltip } from './info-tooltip.js';

const STATUS_LABELS = Object.freeze({
  PASS: 'PASS',
  REVIEW: 'REVIEW',
  FAIL: 'FAIL',
  NOT_EVALUATED: 'NOT EVALUATED',
});

function statusHelp(status, zoneId = null) {
  if (status === 'PASS') return 'The automated checks in this section passed. This is not an anonymisation certification.';
  if (status === 'FAIL') return 'A declared contract failed. Inspect the evidence before use; download availability is a separate user decision.';
  if (status === 'REVIEW' && zoneId === 'distribution-relationships') {
    return 'Review means inspect, not failed generation. Small coverage-first outputs can intentionally over-represent rare test cases.';
  }
  if (status === 'REVIEW') return 'A visible deviation or decision needs user review before the result is used.';
  return 'This area was not evaluated and must not be read as PASS.';
}

export function renderQualityReport(container, report, { onDownload = null } = {}) {
  container.replaceChildren();
  container.hidden = !report;
  if (!report) return;
  const documentRef = container.ownerDocument;

  const reportShell = documentRef.createElement('details');
  reportShell.className = 'quality-report__shell';
  reportShell.open = false;
  const reportSummary = documentRef.createElement('summary');
  reportSummary.className = 'quality-report__summary';
  const title = documentRef.createElement('h3');
  title.textContent = report.kind === 'PROBE' ? 'Probe report' : 'Output report';
  const titleLine = documentRef.createElement('div');
  titleLine.className = 'quality-report__title-line';
  titleLine.append(title, createInfoTooltip(documentRef, {
    label: 'How to read this report',
    content: 'PASS means the automated checks passed. REVIEW means inspect a visible deviation. FAIL means a declared contract failed, without removing your download choice. NOT EVALUATED means the area was not checked. EXACT checks the complete output; SAMPLED checks a bounded sample.',
  }));
  const overallStatus = report.overallStatus;
  const reportStatus = documentRef.createElement('strong');
  reportStatus.className = `quality-report__status quality-report__status--${overallStatus.toLocaleLowerCase().replaceAll('_', '-')}`;
  reportStatus.textContent = STATUS_LABELS[overallStatus] ?? overallStatus;
  reportStatus.title = statusHelp(overallStatus);
  reportSummary.append(titleLine, reportStatus);

  const reportBody = documentRef.createElement('div');
  reportBody.className = 'quality-report__body';
  const tools = documentRef.createElement('div');
  tools.className = 'quality-report__tools';
  const download = documentRef.createElement('button');
  download.type = 'button';
  download.className = 'button button--quiet';
  download.textContent = 'Download report (.json)';
  download.disabled = report.kind === 'PROBE' || typeof onDownload !== 'function';
  download.addEventListener('click', () => onDownload?.(report));
  tools.append(download);

  const scope = documentRef.createElement('p');
  scope.className = 'quality-report__scope';
  scope.textContent = report.notEvaluatedAreas.length > 0
    ? `Not evaluated (${report.notEvaluatedAreas.length}): ${report.notEvaluatedAreas.join(', ')}. These areas are not PASS.`
    : 'All declared report areas were evaluated.';

  const grid = documentRef.createElement('div');
  grid.className = 'quality-report__grid';
  for (const reportZone of report.zones) {
    const card = documentRef.createElement('details');
    card.className = `quality-zone quality-zone--${reportZone.status.toLocaleLowerCase().replaceAll('_', '-')}`;
    card.open = true;
    const summary = documentRef.createElement('summary');
    const label = documentRef.createElement('span');
    label.textContent = reportZone.title;
    const status = documentRef.createElement('strong');
    status.textContent = STATUS_LABELS[reportZone.status] ?? reportZone.status;
    status.title = statusHelp(reportZone.status, reportZone.id);
    summary.append(label, status);
    const body = documentRef.createElement('div');
    body.className = 'quality-zone__body';
    const measurement = documentRef.createElement('small');
    measurement.className = 'quality-zone__measurement';
    measurement.textContent = `Measurement: ${reportZone.measurement}`;
    const description = documentRef.createElement('p');
    description.textContent = reportZone.summary;
    const metrics = documentRef.createElement('dl');
    reportZone.metrics.forEach((item) => {
      const term = documentRef.createElement('dt');
      term.textContent = item.label;
      const value = documentRef.createElement('dd');
      value.textContent = String(item.value);
      value.title = `Measurement status: ${item.measurement}`;
      metrics.append(term, value);
    });
    body.append(measurement, description, metrics);
    if (reportZone.columns.length > 0) {
      const tableWrap = documentRef.createElement('div');
      tableWrap.className = 'quality-zone__table-wrap';
      const table = documentRef.createElement('table');
      table.className = 'quality-zone__table';
      const head = documentRef.createElement('thead');
      const headRow = documentRef.createElement('tr');
      ['Column', 'Action', 'Result', 'Comparison'].forEach((headingText) => {
        const cell = documentRef.createElement('th');
        cell.scope = 'col';
        cell.textContent = headingText;
        headRow.append(cell);
      });
      head.append(headRow);
      const bodyRows = documentRef.createElement('tbody');
      reportZone.columns.forEach((column) => {
        const row = documentRef.createElement('tr');
        [column.columnName, column.action, STATUS_LABELS[column.status] ?? column.status, column.observations.join(' · ')].forEach((value) => {
          const cell = documentRef.createElement('td');
          cell.textContent = value;
          row.append(cell);
        });
        bodyRows.append(row);
      });
      table.append(head, bodyRows);
      tableWrap.append(table);
      body.append(tableWrap);
    }
    reportZone.notes.forEach((note) => {
      const footnote = documentRef.createElement('small');
      footnote.className = 'quality-zone__note';
      footnote.textContent = note;
      body.append(footnote);
    });
    card.append(summary, body);
    grid.append(card);
  }

  const boundary = documentRef.createElement('p');
  boundary.className = 'quality-report__boundary';
  boundary.textContent = report.boundary;
  reportShell.addEventListener('toggle', () => {
    if (reportShell.open) grid.querySelectorAll(':scope > details').forEach((card) => { card.open = true; });
  });
  reportBody.append(tools, scope, grid, boundary);
  reportShell.append(reportSummary, reportBody);
  container.append(reportShell);
}
