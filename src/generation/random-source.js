function requireInteger(value, name) {
  if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer.`);
}

export class CryptoRandomSource {
  constructor(cryptoProvider = globalThis.crypto) {
    if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
      throw new Error('A cryptographic getRandomValues provider is required.');
    }
    this.cryptoProvider = cryptoProvider;
    this.deterministic = false;
  }

  nextUint32() {
    const values = new Uint32Array(1);
    this.cryptoProvider.getRandomValues(values);
    return values[0];
  }

  nextFloat() {
    return this.nextUint32() / 0x1_0000_0000;
  }

  integer(minimum, maximum) {
    requireInteger(minimum, 'minimum');
    requireInteger(maximum, 'maximum');
    if (maximum < minimum) throw new RangeError('maximum must be at least minimum.');
    const range = maximum - minimum + 1;
    if (range > 0x1_0000_0000) throw new RangeError('integer range is too large.');
    if (range === 0x1_0000_0000) return minimum + this.nextUint32();
    const rejectionLimit = Math.floor(0x1_0000_0000 / range) * range;
    let value;
    do value = this.nextUint32(); while (value >= rejectionLimit);
    return minimum + (value % range);
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('values must be a non-empty array.');
    return values[this.integer(0, values.length - 1)];
  }
}

export class SeededRandomSource {
  constructor(seed = 1) {
    requireInteger(seed, 'seed');
    this.state = (seed >>> 0) || 0x6d2b79f5;
    this.deterministic = true;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.nextUint32() / 0x1_0000_0000;
  }

  integer(minimum, maximum) {
    requireInteger(minimum, 'minimum');
    requireInteger(maximum, 'maximum');
    if (maximum < minimum) throw new RangeError('maximum must be at least minimum.');
    return minimum + Math.floor(this.nextFloat() * (maximum - minimum + 1));
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) throw new RangeError('values must be a non-empty array.');
    return values[this.integer(0, values.length - 1)];
  }
}

export function createRandomSource({ seed, cryptoProvider } = {}) {
  return seed === undefined
    ? new CryptoRandomSource(cryptoProvider ?? globalThis.crypto)
    : new SeededRandomSource(seed);
}
