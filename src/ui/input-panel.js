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

export function selectInputValue({
  file = null,
  pastedText = '',
  sourcePreference = null,
  pastedTextIsSample = false,
}) {
  const text = String(pastedText);
  const hasPaste = text.trim() !== '';
  if (file && hasPaste) {
    if (pastedTextIsSample || sourcePreference === 'FILE') {
      return Object.freeze({ input: file, inputKind: undefined, sourceLabel: file.name || 'Selected file' });
    }
    if (sourcePreference === 'PASTE' || sourcePreference === 'SAMPLE') {
      return Object.freeze({
        input: text,
        inputKind: 'PASTE',
        sourceLabel: pastedTextIsSample ? 'the fictional retail-orders sample' : 'pasted spreadsheet text',
      });
    }
    throw new RangeError('Choose whether to analyse the uploaded file or the pasted data. Only one source table can be analysed at a time.');
  }
  if (file) return Object.freeze({ input: file, inputKind: undefined, sourceLabel: file.name || 'Selected file' });
  if (hasPaste) return Object.freeze({
    input: text,
    inputKind: 'PASTE',
    sourceLabel: pastedTextIsSample ? 'the fictional retail-orders sample' : 'pasted spreadsheet text',
  });
  throw new RangeError('Upload a CSV, TSV, or TXT file, paste spreadsheet cells, or try the sample data first.');
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
