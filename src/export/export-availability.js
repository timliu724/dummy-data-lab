export function isGeneratedResultDownloadable({ generationResult, probe = false } = {}) {
  return !probe
    && Array.isArray(generationResult?.headers)
    && Array.isArray(generationResult?.rows);
}

export function isDatasetResultDownloadable({ datasetResult, probe = false } = {}) {
  return !probe
    && Array.isArray(datasetResult?.tableResults)
    && datasetResult.tableResults.length > 0
    && datasetResult.tableResults.every((table) => isGeneratedResultDownloadable({
      generationResult: table.generationResult,
      probe: false,
    }));
}
