export function safeDownloadFilename(extension, date = new Date()) {
  if (!['csv', 'tsv'].includes(extension)) throw new RangeError('extension must be csv or tsv.');
  const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `dummy-data-${stamp}.${extension}`;
}

export function downloadBlob({
  content,
  mimeType,
  extension,
  documentRef = globalThis.document,
  urlRef = globalThis.URL,
  setTimeoutRef = globalThis.setTimeout,
  cleanupDelayMs = 1_000,
}) {
  if (!documentRef?.createElement || typeof urlRef?.createObjectURL !== 'function') {
    throw new Error('Browser Blob download APIs are unavailable.');
  }
  if (typeof setTimeoutRef !== 'function') {
    throw new Error('Browser download cleanup scheduling is unavailable.');
  }
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeDownloadFilename(extension);
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  // Keep both the link and its Blob URL alive long enough for file:// browsers
  // to hand the download to their download manager before cleanup begins.
  setTimeoutRef(() => {
    anchor.remove();
    urlRef.revokeObjectURL(objectUrl);
  }, cleanupDelayMs);
  return Object.freeze({ filename: anchor.download, sizeBytes: blob.size, objectUrlCreated: true });
}
