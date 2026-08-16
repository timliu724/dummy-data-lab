export const WORKER_COMMANDS = Object.freeze({
  ANALYSE: 'ANALYSE',
  REPLAN: 'REPLAN',
  GENERATE: 'GENERATE',
  GENERATE_SCHEMA: 'GENERATE_SCHEMA',
  COMPARE: 'COMPARE',
  CANCEL: 'CANCEL',
  PING: 'PING',
});

export const WORKER_EVENTS = Object.freeze({
  READY: 'READY',
  PROGRESS: 'PROGRESS',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
  PONG: 'PONG',
});

const commandValues = new Set(Object.values(WORKER_COMMANDS));

export function createWorkerRequest(type, requestId, payload = {}) {
  if (!commandValues.has(type)) throw new RangeError(`Unknown Worker command: ${type}`);
  if (typeof requestId !== 'string' || !requestId) throw new TypeError('requestId must be a non-empty string.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('payload must be an object.');
  return Object.freeze({ type, requestId, payload });
}

export function createWorkerEvent(type, requestId, payload = {}) {
  if (!Object.values(WORKER_EVENTS).includes(type)) throw new RangeError(`Unknown Worker event: ${type}`);
  return Object.freeze({ type, requestId: requestId ?? null, payload });
}

export function serialiseWorkerError(error) {
  return Object.freeze({
    name: typeof error?.name === 'string' ? error.name : 'Error',
    code: typeof error?.code === 'string' ? error.code : 'WORKER_TASK_FAILED',
    message: typeof error?.message === 'string' ? error.message : 'Worker processing failed.',
  });
}

export function isWorkerEvent(value) {
  return Boolean(value && typeof value === 'object' && Object.values(WORKER_EVENTS).includes(value.type));
}
