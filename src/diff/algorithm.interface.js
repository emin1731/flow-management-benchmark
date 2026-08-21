const REQUIRED_RESULT_FIELDS = ['equal', 'changes'];

const assertAlgorithm = (algorithm) => {
  if (!algorithm || typeof algorithm.name !== 'string' || !algorithm.name) {
    throw new TypeError('A diff algorithm must provide a name.');
  }

  if (typeof algorithm.compare !== 'function') {
    throw new TypeError(`${algorithm.name} must provide a compare(previous, current) function.`);
  }
};

const assertResult = (algorithmName, result) => {
  if (!result || typeof result !== 'object') {
    throw new TypeError(`${algorithmName} must return a result object.`);
  }

  for (const field of REQUIRED_RESULT_FIELDS) {
    if (!(field in result)) {
      throw new TypeError(`${algorithmName} results must include ${field}.`);
    }
  }
};

module.exports = { assertAlgorithm, assertResult };
