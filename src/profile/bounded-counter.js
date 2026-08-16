/**
 * Fixed-capacity Space-Saving counter. Counts are exact until the first
 * eviction; after that retained heavy-hitter counts are estimates with an
 * explicit maximum over-count error.
 */
export class BoundedCounter {
  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer.');
    }
    this.capacity = capacity;
    this.totalCount = 0;
    this.evictionCount = 0;
    this.counts = new Map();
  }

  /** @param {string|number} value @param {number} [weight] */
  increment(value, weight = 1) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError('weight must be a positive finite number.');
    }
    this.totalCount += weight;
    const existing = this.counts.get(value);
    if (existing) {
      existing.count += weight;
      return;
    }
    if (this.counts.size < this.capacity) {
      this.counts.set(value, { value, count: weight, error: 0 });
      return;
    }

    let minimumKey;
    let minimumEntry;
    for (const [key, entry] of this.counts) {
      if (!minimumEntry || entry.count < minimumEntry.count) {
        minimumKey = key;
        minimumEntry = entry;
      }
    }
    this.counts.delete(minimumKey);
    this.counts.set(value, {
      value,
      count: minimumEntry.count + weight,
      error: minimumEntry.count,
    });
    this.evictionCount += 1;
  }

  get size() {
    return this.counts.size;
  }

  get status() {
    return this.evictionCount === 0 ? 'EXACT' : 'ESTIMATED';
  }

  /** @param {number} [limit] */
  snapshot(limit = this.capacity) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('limit must be a positive integer.');
    }
    return Object.freeze(
      [...this.counts.values()]
        .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value)))
        .slice(0, limit)
        .map((entry) => Object.freeze({
          value: entry.value,
          count: entry.count,
          error: entry.error,
          ratio: this.totalCount === 0 ? 0 : entry.count / this.totalCount,
          status: this.status,
        })),
    );
  }

  memoryEntryCount() {
    return this.counts.size;
  }
}
