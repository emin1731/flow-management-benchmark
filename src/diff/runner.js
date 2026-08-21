const { performance } = require('node:perf_hooks');
const { assertAlgorithm, assertResult } = require('./algorithm.interface');

const runAlgorithm = (algorithm, pair) => {
  assertAlgorithm(algorithm);

  const startedAt = performance.now();
  const result = algorithm.compare(pair.from.form, pair.to.form);
  const durationMs = performance.now() - startedAt;

  assertResult(algorithm.name, result);

  return {
    algorithm: algorithm.name,
    fromVersion: pair.from.version,
    toVersion: pair.to.version,
    durationMs,
    equal: result.equal,
    changes: result.changes,
    metadata: result.metadata || {},
  };
};

const runAlgorithms = (algorithms, pairs) => {
  return algorithms.flatMap((algorithm) => pairs.map((pair) => runAlgorithm(algorithm, pair)));
};

module.exports = { runAlgorithm, runAlgorithms };
