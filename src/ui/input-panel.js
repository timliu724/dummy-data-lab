export function delimiterFromControl(value, customValue = '') {
  if (value === 'auto') return undefined;
  if (value === 'tab') return '\t';
  if (value === 'comma') return ',';
  if (value === 'semicolon') return ';';
  if (value === 'pipe') return '|';
  if (value === 'custom') {
    if ([...customValue].length !== 1) throw new RangeError('Custom delimiter must be exactly one character.');
    return customValue;
  }
  throw new RangeError('Unknown delimiter selection.');
}

export function selectInputValue({ file = null, pastedText = '' }) {
  if (file) return Object.freeze({ input: file, inputKind: undefined, sourceLabel: file.name || 'Selected file' });
  if (String(pastedText).trim() !== '') return Object.freeze({ input: String(pastedText), inputKind: 'PASTE', sourceLabel: 'Pasted spreadsheet text' });
  throw new RangeError('Choose a CSV/TXT/TSV file or paste spreadsheet data first.');
}

export function parseOptionsFromControls({ delimiterMode, customDelimiter, headerMode, inputKind }) {
  const delimiter = delimiterFromControl(delimiterMode, customDelimiter);
  return Object.freeze({
    ...(delimiter ? { delimiter } : {}),
    header: headerMode,
    autoHeaderFallback: headerMode === 'auto',
    ...(inputKind ? { inputKind } : {}),
  });
}

export function parseRecognitionAllowlist(value, { maximumEntries = 100, maximumLength = 128 } = {}) {
  if (!Number.isInteger(maximumEntries) || maximumEntries <= 0) throw new RangeError('maximumEntries must be positive.');
  if (!Number.isInteger(maximumLength) || maximumLength <= 0) throw new RangeError('maximumLength must be positive.');
  return Object.freeze([...new Set(
    String(value ?? '')
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, maximumEntries)
      .map((entry) => entry.slice(0, maximumLength)),
  )]);
}

export function requiresHeaderConfirmation(parseResult) {
  return parseResult?.headerDetection?.decision === 'ambiguous';
}
