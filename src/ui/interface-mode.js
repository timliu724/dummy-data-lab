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
    description: mode === 'BASIC'
      ? 'Basic guide shows one stage at a time. Your Advanced settings remain active and preserved.'
      : 'Advanced workbench shows all stages and detailed controls. Your Basic progress and settings are preserved.',
  });
}
