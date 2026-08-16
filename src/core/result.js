/**
 * @template T
 * @typedef {Object} SuccessResult
 * @property {true} ok
 * @property {T} value
 * @property {readonly unknown[]} warnings
 */

/**
 * @typedef {Object} FailureResult
 * @property {false} ok
 * @property {readonly unknown[]} errors
 * @property {readonly unknown[]} warnings
 */

/**
 * @template T
 * @typedef {SuccessResult<T> | FailureResult} Result
 */

/** @param {unknown} value */
function freezeArray(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected an array.');
  }

  return Object.freeze([...value]);
}

/**
 * Creates a successful result without mutating the supplied warning array.
 *
 * @template T
 * @param {T} value
 * @param {{warnings?: unknown[]}} [options]
 * @returns {SuccessResult<T>}
 */
export function success(value, { warnings = [] } = {}) {
  return Object.freeze({
    ok: true,
    value,
    warnings: freezeArray(warnings),
  });
}

/**
 * Creates a failed result. At least one error is required so callers cannot
 * accidentally return a failure with no explanation.
 *
 * @param {unknown[]} errors
 * @param {{warnings?: unknown[]}} [options]
 * @returns {FailureResult}
 */
export function failure(errors, { warnings = [] } = {}) {
  const frozenErrors = freezeArray(errors);
  if (frozenErrors.length === 0) {
    throw new RangeError('A failed result requires at least one error.');
  }

  return Object.freeze({
    ok: false,
    errors: frozenErrors,
    warnings: freezeArray(warnings),
  });
}

/**
 * @param {unknown} value
 * @returns {value is Result<unknown>}
 */
export function isResult(value) {
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    return false;
  }

  if (value.ok === true) {
    return 'value' in value && Array.isArray(value.warnings);
  }

  return (
    value.ok === false &&
    Array.isArray(value.errors) &&
    value.errors.length > 0 &&
    Array.isArray(value.warnings)
  );
}
