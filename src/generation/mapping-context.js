import { UniqueRegistry } from './unique-registry.js';

function mappingKey(value) {
  if (value === null) return 'null:';
  if (value === undefined) return 'undefined:';
  return `${typeof value}:${String(value)}`;
}

export class MappingContext {
  constructor({ uniqueRegistry = new UniqueRegistry(), maxAttempts = 64, allowDuplicateFallback = true } = {}) {
    this.uniqueRegistry = uniqueRegistry;
    this.maxAttempts = maxAttempts;
    this.allowDuplicateFallback = allowDuplicateFallback;
    this.scopes = new Map();
    this.hitCount = 0;
    this.missCount = 0;
  }

  resolve(scope, originalValue, factory) {
    if (typeof factory !== 'function') throw new TypeError('factory must be a function.');
    const scopeName = String(scope || 'default');
    const originalKey = mappingKey(originalValue);
    const mappings = this.scopes.get(scopeName) ?? new Map();
    this.scopes.set(scopeName, mappings);
    if (mappings.has(originalKey)) {
      this.hitCount += 1;
      return mappings.get(originalKey);
    }
    this.missCount += 1;
    const generated = this.uniqueRegistry.generate(
      scopeName,
      (attempt) => factory(attempt),
      this.maxAttempts,
      { allowDuplicateFallback: this.allowDuplicateFallback },
    );
    mappings.set(originalKey, generated);
    return generated;
  }

  statistics() {
    return Object.freeze({
      scopeCount: this.scopes.size,
      mappingCount: [...this.scopes.values()].reduce((sum, mappings) => sum + mappings.size, 0),
      hitCount: this.hitCount,
      missCount: this.missCount,
      uniqueness: this.uniqueRegistry.statistics(),
    });
  }

  clear() {
    for (const mappings of this.scopes.values()) mappings.clear();
    this.scopes.clear();
    this.uniqueRegistry.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }
}
