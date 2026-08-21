'use strict';

/**
 * @typedef {object} Result
 * @property {boolean} equal        true when the two forms are semantically identical
 * @property {Array} changes        algorithm-specific change entries
 * @property {object} [metadata]    counters and measurements, never part of the contract
 * @property {object} [ordering]    optional ordering analysis
 * @property {object} [verdict]     optional compatibility verdict
 */

const REQUIRED_RESULT_FIELDS = ['equal', 'changes'];

/**
 * Validates the algorithm contract: a name and a compare(previous, current).
 *
 * @param {object} algorithm
 */
const assertAlgorithm = (algorithm) => {
  if (!algorithm || typeof algorithm.name !== 'string' || !algorithm.name) {
    throw new TypeError('A diff algorithm must provide a name.');
  }

  if (typeof algorithm.compare !== 'function') {
    throw new TypeError(`${algorithm.name} must provide a compare(previous, current) function.`);
  }
};

/** Alias kept because the algorithm registry imports this name. */
const assertValidAlgorithm = assertAlgorithm;

/**
 * Validates a compare() return value.
 *
 * @param {string} algorithmName
 * @param {object} result
 */
const assertResult = (algorithmName, result) => {
  if (!result || typeof result !== 'object') {
    throw new TypeError(`${algorithmName} must return a result object.`);
  }

  for (const field of REQUIRED_RESULT_FIELDS) {
    if (!(field in result)) {
      throw new TypeError(`${algorithmName} results must include ${field}.`);
    }
  }

  if (typeof result.equal !== 'boolean') {
    throw new TypeError(`${algorithmName} must return a boolean equal.`);
  }

  if (!Array.isArray(result.changes)) {
    throw new TypeError(`${algorithmName} must return an array of changes.`);
  }
};

/**
 * Builds the standard metadata block. Algorithms may add their own counters on
 * top; only these keys are relied on by the report.
 *
 * @param {object} input
 * @returns {object}
 */
const buildMetadata = ({ algorithm, durationMs, comparisonCount, normalizedNodeCount, ...rest }) => ({
  algorithm,
  durationMs,
  comparisonCount: comparisonCount ?? 0,
  normalizedNodeCount: normalizedNodeCount ?? 0,
  ...rest,
});

/**
 * Normalizes a compare() return value into the shared result shape.
 *
 * @param {Result} result
 * @returns {Result}
 */
const createResult = ({ equal, changes, metadata, ordering, verdict }) => ({
  equal: Boolean(equal),
  changes: changes || [],
  metadata: metadata || {},
  ...(ordering ? { ordering } : {}),
  ...(verdict ? { verdict } : {}),
});

module.exports = {
  assertAlgorithm,
  assertValidAlgorithm,
  assertResult,
  buildMetadata,
  createResult,
};
