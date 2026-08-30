export const INTERFACE_MODES = Object.freeze(['BASIC', 'ADVANCED']);

export function normaliseInterfaceMode(value) {
  return INTERFACE_MODES.includes(value) ? value : 'BASIC';
}

export function interfaceModeModel(value) {
  const mode = normaliseInterfaceMode(value);
  return Object.freeze({
    mode,
    isBasic: mode === 'BASIC',
    isAdvanced: mode === 'ADVANCED',
  });
}
