export class UniqueRegistry {
  constructor() {
    this.scopes = new Map();
    this.collisionCount = 0;
    this.relaxedCollisionCount = 0;
    this.relaxedScopes = new Set();
  }

  claim(scope, value) {
    const scopeName = String(scope || 'default');
    const key = `${typeof value}:${String(value)}`;
    const values = this.scopes.get(scopeName) ?? new Set();
    this.scopes.set(scopeName, values);
    if (values.has(key)) {
      this.collisionCount += 1;
      return false;
    }
    values.add(key);
    return true;
  }

  generate(scope, factory, maxAttempts = 64, { allowDuplicateFallback = false } = {}) {
    if (typeof factory !== 'function') throw new TypeError('factory must be a function.');
    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new RangeError('maxAttempts must be positive.');
    let candidate;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      candidate = factory(attempt);
      if (this.claim(scope, candidate)) return candidate;
    }
    if (allowDuplicateFallback) {
      this.relaxedCollisionCount += 1;
      this.relaxedScopes.add(String(scope || 'default'));
      return candidate;
    }
    const claimedCount = this.scopes.get(String(scope || 'default'))?.size ?? 0;
    throw new Error(`Unable to create a unique value in scope ${scope} after ${maxAttempts} attempts (${claimedCount} values already claimed).`);
  }

  statistics() {
    return Object.freeze({
      scopeCount: this.scopes.size,
      claimedValueCount: [...this.scopes.values()].reduce((sum, values) => sum + values.size, 0),
      collisionCount: this.collisionCount,
      relaxedCollisionCount: this.relaxedCollisionCount,
      relaxedScopeCount: this.relaxedScopes.size,
    });
  }

  clear() {
    this.scopes.clear();
    this.collisionCount = 0;
    this.relaxedCollisionCount = 0;
    this.relaxedScopes.clear();
  }
}
