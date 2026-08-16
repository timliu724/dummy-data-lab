const FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

export function isOrdinaryNegativeNumber(value) {
  const text = String(value ?? '').trim();
  return /^-(?:(?:[$€£¥₹]\s*)?\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)(?:%|\s*[A-Z]{3})?$/u.test(text);
}

export function formulaInjectionRisk(value) {
  const text = String(value ?? '');
  if (text === '' || text.startsWith("'")) return false;
  const withoutLeadingWhitespace = text.replace(/^[\u0000-\u0020]+/u, '');
  const first = withoutLeadingWhitespace[0];
  if (!FORMULA_PREFIXES.has(first)) return false;
  if (first === '-' && isOrdinaryNegativeNumber(withoutLeadingWhitespace)) return false;
  return true;
}

export function makeExcelSafe(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return formulaInjectionRisk(text) ? `'${text}` : text;
}

export function inspectFormulaRisks(rows, { headers = [] } = {}) {
  const risks = [];
  headers.forEach((value, columnIndex) => {
    if (formulaInjectionRisk(value)) {
      risks.push(Object.freeze({ section: 'HEADER', rowIndex: null, columnIndex }));
    }
  });
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (formulaInjectionRisk(value)) {
      risks.push(Object.freeze({ section: 'DATA', rowIndex, columnIndex }));
    }
  }));
  return Object.freeze(risks);
}

export function formulaRiskSummary(risks = []) {
  const headerCount = risks.filter((risk) => risk.section === 'HEADER').length;
  const dataCellCount = risks.length - headerCount;
  return Object.freeze({ total: risks.length, headerCount, dataCellCount });
}
