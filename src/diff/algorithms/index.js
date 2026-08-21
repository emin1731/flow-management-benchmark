'use strict';

const deepEquality = require('./deep-equality');
const recursiveJsonDiff = require('./recursive-json-diff');
const hierarchicalKeyedDiff = require('./hierarchical-keyed-diff');
const { assertValidAlgorithm } = require('../algorithm.interface');

/** All registered diff algorithms, validated against the shared contract. */
const algorithms = [deepEquality, recursiveJsonDiff, hierarchicalKeyedDiff];

algorithms.forEach(assertValidAlgorithm);

/**
 * @param {string} name
 * @returns {object} the algorithm registered under `name`
 */
function getAlgorithm(name) {
  const algorithm = algorithms.find((a) => a.name === name);
  if (!algorithm) {
    throw new Error(`Unknown algorithm "${name}". Registered: ${algorithms.map((a) => a.name).join(', ')}`);
  }
  return algorithm;
}

module.exports = {
  algorithms,
  getAlgorithm,
  deepEquality,
  recursiveJsonDiff,
  hierarchicalKeyedDiff,
};
