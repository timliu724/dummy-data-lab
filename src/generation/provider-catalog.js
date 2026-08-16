import { BasicProvider } from './basic-provider.js';

const BUILT_IN_GENERATORS = Object.freeze([
  Object.freeze({ id: 'person-name', label: 'Person name', category: 'People' }),
  Object.freeze({ id: 'email', label: 'Email', category: 'People' }),
  Object.freeze({ id: 'phone', label: 'Phone', category: 'People' }),
  Object.freeze({ id: 'address', label: 'Address', category: 'People' }),
  Object.freeze({ id: 'integer', label: 'Integer', category: 'Numbers' }),
  Object.freeze({ id: 'decimal', label: 'Decimal', category: 'Numbers' }),
  Object.freeze({ id: 'boolean', label: 'Boolean', category: 'General' }),
  Object.freeze({ id: 'category', label: 'Category', category: 'General' }),
  Object.freeze({ id: 'date', label: 'Date', category: 'Date & time' }),
  Object.freeze({ id: 'datetime', label: 'Date and time', category: 'Date & time' }),
  Object.freeze({ id: 'sequence', label: 'Sequence', category: 'Identifiers' }),
  Object.freeze({ id: 'uuid', label: 'UUID', category: 'Identifiers' }),
  Object.freeze({ id: 'constant', label: 'Constant', category: 'General' }),
  Object.freeze({ id: 'copy-column', label: 'Copy another column', category: 'Dependent' }),
  Object.freeze({ id: 'template', label: 'Text around another column', category: 'Dependent' }),
  Object.freeze({ id: 'date-after', label: 'Date after another column', category: 'Dependent' }),
  Object.freeze({ id: 'foreign-key', label: 'Foreign key', category: 'Relationships' }),
  Object.freeze({ id: 'lookup-foreign', label: 'Copy from linked parent', category: 'Relationships' }),
  Object.freeze({ id: 'date-after-foreign', label: 'Date after linked parent', category: 'Relationships' }),
]);

export class ProviderCatalog {
  constructor({ random, providers } = {}) {
    this.providers = Object.freeze({
      basic: providers?.basic ?? (random ? new BasicProvider({ random }) : null),
    });
  }

  listGenerators() {
    return BUILT_IN_GENERATORS;
  }

  hasGenerator(id) {
    return BUILT_IN_GENERATORS.some((entry) => entry.id === id);
  }

  getGenerator(id) {
    const generator = BUILT_IN_GENERATORS.find((entry) => entry.id === id);
    if (!generator) throw new RangeError(`Unknown generator type: ${id}`);
    return generator;
  }
}

export function createProviderCatalog(options) {
  return new ProviderCatalog(options);
}
