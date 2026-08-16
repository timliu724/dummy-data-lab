export class PipelineCancelledError extends Error {
  constructor(message = 'Processing was cancelled.') {
    super(message);
    this.name = 'PipelineCancelledError';
    this.code = 'PIPELINE_CANCELLED';
  }
}

export function createChunkController({
  progressEveryRows = 1000,
  onProgress,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  if (!Number.isInteger(progressEveryRows) || progressEveryRows < 1) {
    throw new RangeError('progressEveryRows must be a positive integer.');
  }
  let cancelled = false;
  let reason = 'Processing was cancelled.';
  let lastReportedRow = 0;
  const startedAt = now();

  const checkpoint = ({ phase, rowCount, total = null, message } = {}) => {
    if (cancelled) return false;
    const current = Number.isFinite(rowCount) ? Math.max(0, rowCount) : 0;
    if (current === 0 || current - lastReportedRow >= progressEveryRows || (total && current >= total)) {
      lastReportedRow = current;
      onProgress?.(Object.freeze({
        phase: phase ?? 'PROCESSING',
        message: message ?? `Processed ${current.toLocaleString()} rows…`,
        current,
        total: Number.isFinite(total) && total > 0 ? total : null,
        elapsedMs: Math.max(0, now() - startedAt),
      }));
    }
    return true;
  };

  const cancel = (message) => {
    cancelled = true;
    if (typeof message === 'string' && message.trim()) reason = message.trim();
  };

  const throwIfCancelled = () => {
    if (cancelled) throw new PipelineCancelledError(reason);
  };

  return Object.freeze({
    checkpoint,
    cancel,
    throwIfCancelled,
    get cancelled() { return cancelled; },
    get elapsedMs() { return Math.max(0, now() - startedAt); },
  });
}
