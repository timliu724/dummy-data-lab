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
      ? 'Quick shows one clear step at a time for transforming data or generating one table. Advanced settings remain preserved.'
      : 'Advanced shows the complete workbench for related tables, dependencies, and detailed controls. Quick progress and settings remain preserved.',
  });
}
