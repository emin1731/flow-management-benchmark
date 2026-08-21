const createBenchmarkReport = ({ fixtureCount, pairs, results }) => ({
  generatedAt: new Date().toISOString(),
  fixtureCount,
  pairCount: pairs.length,
  algorithms: [...new Set(results.map((result) => result.algorithm))],
  results,
});

module.exports = { createBenchmarkReport };
