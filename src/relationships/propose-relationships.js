import { createRelationshipRule } from '../core/contracts.js';

function normalizedBase(header) {
  let base = header.toLocaleLowerCase();
  let previous;
  do {
    previous = base;
    base = base.replace(/[_\s-]+(code|description|desc|name|start|end|from|to|date)$/u, '');
  } while (base !== previous);
  return base;
}

function proposal(id, kind, columnNames, evidence, confidence = 'MEDIUM') {
  return createRelationshipRule({
    id,
    kind,
    columnNames,
    confidence,
    confidenceScore: null,
    support: 0,
    status: 'INFORMATIONAL',
    enabled: false,
    evidence: [...evidence, 'No row-level support was measured; this is a column-name hint only.'],
    source: 'DETECTED',
    reviewRequired: true,
  });
}

export function proposeRelationships({ headers, detections = [] }) {
  if (!Array.isArray(headers)) throw new TypeError('headers must be an array.');
  const proposals = [];
  for (let left = 0; left < headers.length; left += 1) {
    for (let right = left + 1; right < headers.length; right += 1) {
      const leftName = headers[left];
      const rightName = headers[right];
      const sameBase = normalizedBase(leftName) === normalizedBase(rightName);
      if (!sameBase) continue;
      const pair = `${leftName} ${rightName}`.toLocaleLowerCase();
      if (/code/.test(pair) && /(description|desc|name)/.test(pair)) {
        const codeFirst = /code/i.test(leftName);
        proposals.push(proposal(
          `proposal:code-description:${left}:${right}`,
          /name/i.test(pair) ? 'CATEGORY_CODE_NAME' : 'CODE_DESCRIPTION',
          codeFirst ? [leftName, rightName] : [rightName, leftName],
          ['Column names share a base and look like a code/description pair.'],
        ));
      } else if (/(start|from)/.test(pair) && /(end|to)/.test(pair)) {
        const leftFirst = /(start|from)/i.test(leftName);
        proposals.push(proposal(
          `proposal:date-order:${left}:${right}`,
          'DATE_ORDER',
          leftFirst ? [leftName, rightName] : [rightName, leftName],
          ['Column names share a base and suggest an ordered date pair.'],
        ));
      } else if (['NUMERIC_ID', 'ALPHANUMERIC_CODE'].includes(detections[left]?.type)
        && detections[left]?.type === detections[right]?.type) {
        proposals.push(proposal(
          `proposal:same-id:${left}:${right}`,
          'SAME_ID',
          [leftName, rightName],
          ['Column names share a base and both columns have the same identifier type.'],
          'LOW',
        ));
      }
    }
  }
  return Object.freeze(proposals);
}
