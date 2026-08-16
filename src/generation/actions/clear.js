export function executeClear() {
  return Object.freeze({ value: '', dropped: false, warnings: Object.freeze([]) });
}
