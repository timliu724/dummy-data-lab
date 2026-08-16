function numericValue(value) {
  const source = String(value ?? '').trim();
  if (!source) return null;
  const negative = /^\(.*\)$/.test(source);
  const cleaned = source.replace(/[,$£€¥%()\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : null;
}

export function alignGeneratedNumericRanks({
  sourceHeaders,
  outputHeaders,
  generatedRows,
  sourceNumericRankData,
} = {}) {
  if (!sourceNumericRankData || !Array.isArray(sourceNumericRankData.rows)) {
    return Object.freeze({ alignedColumnCount: 0, alignedCellCount: 0 });
  }
  if (sourceNumericRankData.rows.length !== generatedRows.length) {
    throw new RangeError('Source rank rows must align exactly with High match output rows.');
  }
  const outputIndex = new Map(outputHeaders.map((header, index) => [header, index]));
  let alignedColumnCount = 0;
  let alignedCellCount = 0;
  for (const [rankOffset, sourceColumnIndex] of sourceNumericRankData.columnIndexes.entries()) {
    const targetIndex = outputIndex.get(sourceHeaders[sourceColumnIndex]);
    if (!Number.isInteger(targetIndex)) continue;
    const sourceOrder = [];
    const generatedValues = [];
    for (let rowIndex = 0; rowIndex < generatedRows.length; rowIndex += 1) {
      const sourceValue = sourceNumericRankData.rows[rowIndex]?.[rankOffset] ?? null;
      const generatedValue = numericValue(generatedRows[rowIndex][targetIndex]);
      if (sourceValue === null || generatedValue === null) continue;
      sourceOrder.push({ rowIndex, value: sourceValue });
      generatedValues.push({ text: generatedRows[rowIndex][targetIndex], value: generatedValue, rowIndex });
    }
    if (sourceOrder.length < 3 || sourceOrder.length !== generatedValues.length) continue;
    sourceOrder.sort((left, right) => left.value - right.value || left.rowIndex - right.rowIndex);
    generatedValues.sort((left, right) => left.value - right.value || left.rowIndex - right.rowIndex);
    for (let index = 0; index < sourceOrder.length; index += 1) {
      const rowIndex = sourceOrder[index].rowIndex;
      const row = [...generatedRows[rowIndex]];
      row[targetIndex] = generatedValues[index].text;
      generatedRows[rowIndex] = Object.freeze(row);
      alignedCellCount += 1;
    }
    alignedColumnCount += 1;
  }
  return Object.freeze({ alignedColumnCount, alignedCellCount });
}

