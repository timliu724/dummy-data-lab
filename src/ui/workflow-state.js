export const WORKFLOW_STATES = Object.freeze(['IDLE', 'ANALYSING', 'READY', 'GENERATING', 'GENERATED', 'ERROR']);

const ALLOWED = Object.freeze({
  IDLE: new Set(['ANALYSING', 'READY']),
  ANALYSING: new Set(['READY', 'ERROR', 'IDLE']),
  READY: new Set(['ANALYSING', 'GENERATING', 'ERROR']),
  GENERATING: new Set(['GENERATED', 'ERROR', 'READY']),
  GENERATED: new Set(['ANALYSING', 'GENERATING', 'ERROR']),
  ERROR: new Set(['ANALYSING', 'GENERATING', 'READY']),
});

export function transitionWorkflow(current, next) {
  if (!WORKFLOW_STATES.includes(current) || !WORKFLOW_STATES.includes(next)) {
    throw new RangeError('Unknown workflow state.');
  }
  if (!ALLOWED[current].has(next)) throw new RangeError(`Cannot transition from ${current} to ${next}.`);
  return next;
}
