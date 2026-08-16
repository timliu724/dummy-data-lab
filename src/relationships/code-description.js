export class CodeDescriptionContext {
  constructor() {
    this.descriptions = new Map();
  }

  descriptionFor(generatedCode) {
    const key = String(generatedCode ?? '');
    if (!this.descriptions.has(key)) {
      this.descriptions.set(key, `Test description for ${key}`);
    }
    return this.descriptions.get(key);
  }

  statistics() {
    return Object.freeze({ pairCount: this.descriptions.size });
  }
}

export function applyCodeDescription({ row, headers, rule, context }) {
  const [codeColumn, descriptionColumn] = rule.columnNames;
  const codeIndex = headers.indexOf(codeColumn);
  const descriptionIndex = headers.indexOf(descriptionColumn);
  if (codeIndex < 0 || descriptionIndex < 0) return row;
  const updated = [...row];
  updated[descriptionIndex] = context.descriptionFor(updated[codeIndex]);
  return updated;
}
