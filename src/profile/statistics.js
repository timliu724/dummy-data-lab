import { stableHash32 } from './value-normalization.js';

/** @param {number} numerator @param {number} denominator */
export function safeRatio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** @param {readonly number[]} values */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** @param {readonly number[]} values @param {number} probability */
export function quantile(values, probability) {
  if (values.length === 0) return null;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('probability must be between 0 and 1.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

/**
 * Calculates an exact quantile from a sorted numeric frequency table without
 * expanding it into one entry per observed row.
 *
 * @param {readonly {value: number, count: number}[]} entries
 * @param {number} probability
 */
export function weightedQuantile(entries, probability) {
  if (entries.length === 0) return null;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('probability must be between 0 and 1.');
  }
  const totalCount = entries.reduce((total, entry) => total + entry.count, 0);
  if (totalCount <= 0) return null;
  const valueAtRank = (rank) => {
    let cumulative = 0;
    for (const entry of entries) {
      cumulative += entry.count;
      if (rank < cumulative) return entry.value;
    }
    return entries.at(-1).value;
  };
  const position = (totalCount - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = valueAtRank(lowerIndex);
  const upper = valueAtRank(upperIndex);
  return lowerIndex === upperIndex
    ? lower
    : lower + (upper - lower) * (position - lowerIndex);
}

/**
 * Keeps an early stratum plus a deterministic hash-priority stratum. Values
 * are distinct within the retained sample and memory never exceeds capacity.
 */
export class BoundedStratifiedSample {
  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer.');
    }
    this.capacity = capacity;
    this.headCapacity = Math.ceil(capacity / 2);
    this.tailCapacity = capacity - this.headCapacity;
    this.consideredCount = 0;
    this.head = [];
    this.tail = [];
  }

  /** @param {string} value @param {string} [key] */
  offer(value, key = value) {
    this.consideredCount += 1;
    if (this.head.some((entry) => entry.key === key) || this.tail.some((entry) => entry.key === key)) return;
    if (this.head.length < this.headCapacity) {
      this.head.push({ value, key });
      return;
    }
    if (this.tailCapacity === 0) return;
    const priority = stableHash32(key);
    if (this.tail.length < this.tailCapacity) {
      this.tail.push({ value, key, priority });
      return;
    }
    let worstIndex = 0;
    for (let index = 1; index < this.tail.length; index += 1) {
      if (this.tail[index].priority > this.tail[worstIndex].priority) worstIndex = index;
    }
    if (priority < this.tail[worstIndex].priority) {
      this.tail[worstIndex] = { value, key, priority };
    }
  }

  snapshot() {
    return Object.freeze([
      ...this.head.map((entry) => entry.value),
      ...this.tail.sort((left, right) => left.priority - right.priority).map((entry) => entry.value),
    ]);
  }

  get size() {
    return this.head.length + this.tail.length;
  }
}

/** Fixed-capacity deterministic reservoir that preserves value frequencies. */
export class BoundedReservoir {
  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer.');
    }
    this.capacity = capacity;
    this.seenCount = 0;
    this.values = [];
  }

  /** @param {number} value */
  offer(value) {
    this.seenCount += 1;
    if (this.values.length < this.capacity) {
      this.values.push(value);
      return;
    }
    const selected = stableHash32(`${this.seenCount}|${value}`) % this.seenCount;
    if (selected < this.capacity) this.values[selected] = value;
  }

  snapshot() {
    return Object.freeze([...this.values]);
  }
}

export class RunningNumericStatistics {
  /** @param {number} sampleCapacity @param {number} [supportCapacity] */
  constructor(sampleCapacity, supportCapacity = 4096) {
    if (!Number.isInteger(supportCapacity) || supportCapacity <= 0) {
      throw new RangeError('supportCapacity must be a positive integer.');
    }
    this.count = 0;
    this.minimum = null;
    this.maximum = null;
    this.mean = 0;
    this.sample = new BoundedReservoir(sampleCapacity);
    this.supportCapacity = supportCapacity;
    this.supportCounts = new Map();
    this.supportOverflow = false;
  }

  /** @param {number} value */
  update(value) {
    if (!Number.isFinite(value)) return;
    this.count += 1;
    this.minimum = this.minimum === null ? value : Math.min(this.minimum, value);
    this.maximum = this.maximum === null ? value : Math.max(this.maximum, value);
    this.mean += (value - this.mean) / this.count;
    this.sample.offer(value);
    if (this.supportCounts.has(value)) {
      this.supportCounts.set(value, this.supportCounts.get(value) + 1);
    } else if (this.supportCounts.size < this.supportCapacity) {
      this.supportCounts.set(value, 1);
    } else {
      this.supportOverflow = true;
    }
  }

  snapshot() {
    const sampledValues = this.sample.snapshot();
    const distributionSample = [...sampledValues].sort((left, right) => left - right);
    const distributionSampleStatus = this.count <= this.sample.capacity ? 'EXACT' : 'SAMPLED';
    const distributionSupport = [...this.supportCounts.entries()]
      .map(([value, count]) => Object.freeze({ value, count }))
      .sort((left, right) => left.value - right.value);
    const distributionSupportStatus = this.supportOverflow ? 'LOWER_BOUND' : 'EXACT';
    const exactSupportAvailable = distributionSupportStatus === 'EXACT';
    const quantileSource = (probability) => exactSupportAvailable
      ? weightedQuantile(distributionSupport, probability)
      : quantile(distributionSample, probability);
    const quantiles = Object.freeze({
      p01: quantileSource(0.01),
      p05: quantileSource(0.05),
      p25: quantileSource(0.25),
      p50: quantileSource(0.50),
      p75: quantileSource(0.75),
      p95: quantileSource(0.95),
      p99: quantileSource(0.99),
    });
    const quantileStatus = exactSupportAvailable ? 'EXACT' : distributionSampleStatus;
    return Object.freeze({
      count: this.count,
      minimum: this.minimum,
      maximum: this.maximum,
      average: this.count === 0 ? null : this.mean,
      median: quantiles.p50,
      medianStatus: quantileStatus,
      medianSampleSize: exactSupportAvailable ? this.count : sampledValues.length,
      distributionSample: Object.freeze(distributionSample),
      distributionSampleStatus,
      distributionSampleSize: distributionSample.length,
      distributionDistinctCount: new Set(distributionSample).size,
      distributionSupport: Object.freeze(distributionSupport),
      distributionSupportStatus,
      distributionSupportSize: distributionSupport.length,
      distributionFrequencyCounts: Object.freeze(distributionSupport.map((entry) => entry.count)),
      quantiles,
      quantileStatus,
    });
  }
}
