import {
  WORKER_COMMANDS,
  WORKER_EVENTS,
  createWorkerRequest,
  isWorkerEvent,
} from './worker-protocol.js';

const EMBEDDED_WORKER_SOURCE = typeof __DUMMY_WORKER_SOURCE__ === 'string'
  ? __DUMMY_WORKER_SOURCE__
  : '';

export function inlineWorkerAvailable({
  source = EMBEDDED_WORKER_SOURCE,
  WorkerCtor = globalThis.Worker,
  BlobCtor = globalThis.Blob,
  URLApi = globalThis.URL,
} = {}) {
  return Boolean(source && WorkerCtor && BlobCtor && URLApi?.createObjectURL && URLApi?.revokeObjectURL);
}

export function createInlineWorker({
  source = EMBEDDED_WORKER_SOURCE,
  WorkerCtor = globalThis.Worker,
  BlobCtor = globalThis.Blob,
  URLApi = globalThis.URL,
  onProgress,
} = {}) {
  if (!inlineWorkerAvailable({ source, WorkerCtor, BlobCtor, URLApi })) return null;
  const blob = new BlobCtor([source], { type: 'text/javascript' });
  const objectUrl = URLApi.createObjectURL(blob);
  let worker;
  try {
    worker = new WorkerCtor(objectUrl);
  } finally {
    URLApi.revokeObjectURL(objectUrl);
  }

  let sequence = 0;
  let activeRequestId = null;
  const pending = new Map();

  const settle = (requestId, method, value) => {
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    if (activeRequestId === requestId) activeRequestId = null;
    entry[method](value);
  };

  worker.addEventListener('message', (event) => {
    const message = event.data;
    if (!isWorkerEvent(message)) return;
    if (message.type === WORKER_EVENTS.PROGRESS) {
      onProgress?.(message.payload);
      return;
    }
    if (message.type === WORKER_EVENTS.RESULT || message.type === WORKER_EVENTS.PONG) {
      settle(message.requestId, 'resolve', message.payload);
      return;
    }
    if (message.type === WORKER_EVENTS.CANCELLED) {
      const error = new Error(message.payload?.message ?? 'Processing was cancelled.');
      error.name = 'PipelineCancelledError';
      error.code = 'PIPELINE_CANCELLED';
      settle(message.requestId, 'reject', error);
      return;
    }
    if (message.type === WORKER_EVENTS.ERROR) {
      const error = new Error(message.payload?.message ?? 'Worker processing failed.');
      error.name = message.payload?.name ?? 'Error';
      error.code = message.payload?.code ?? 'WORKER_TASK_FAILED';
      settle(message.requestId, 'reject', error);
    }
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(event?.message ?? 'The inline Worker stopped unexpectedly.');
    for (const requestId of [...pending.keys()]) settle(requestId, 'reject', error);
  });

  const request = (type, payload = {}) => {
    const requestId = `request-${++sequence}`;
    activeRequestId = requestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      worker.postMessage(createWorkerRequest(type, requestId, payload));
    });
  };

  const cancel = (reason = 'Cancelled by the user.') => {
    if (!activeRequestId) return false;
    worker.postMessage(createWorkerRequest(WORKER_COMMANDS.CANCEL, `cancel-${++sequence}`, {
      targetRequestId: activeRequestId,
      reason,
    }));
    return true;
  };

  const terminate = () => {
    const error = new Error('Worker was terminated.');
    for (const requestId of [...pending.keys()]) settle(requestId, 'reject', error);
    worker.terminate();
  };

  return Object.freeze({
    analyse: (payload) => request(WORKER_COMMANDS.ANALYSE, payload),
    replan: (payload) => request(WORKER_COMMANDS.REPLAN, payload),
    generate: (payload) => request(WORKER_COMMANDS.GENERATE, payload),
    generateSchema: (payload) => request(WORKER_COMMANDS.GENERATE_SCHEMA, payload),
    compare: (payload) => request(WORKER_COMMANDS.COMPARE, payload),
    ping: () => request(WORKER_COMMANDS.PING, {}),
    cancel,
    terminate,
    get busy() { return activeRequestId !== null; },
  });
}
