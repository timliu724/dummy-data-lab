export function downloadJson(content, {
  filename = 'dummy-data-config.json',
  documentRef = globalThis.document,
  urlRef = globalThis.URL,
  setTimeoutRef = globalThis.setTimeout,
} = {}) {
  if (!documentRef?.createElement || typeof urlRef?.createObjectURL !== 'function') {
    throw new Error('Browser download APIs are unavailable.');
  }
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  setTimeoutRef(() => {
    anchor.remove();
    urlRef.revokeObjectURL(objectUrl);
  }, 1_000);
  return Object.freeze({ filename, sizeBytes: blob.size });
}
