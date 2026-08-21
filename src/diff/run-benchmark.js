const path = require('node:path');
const { discoverFixtures, createVersionPairs } = require('./fixture-loader');
const algorithms = require('./algorithms');
const { createBenchmarkReport } = require('./report');
const { runAlgorithms } = require('./runner');

const fixtures = discoverFixtures(path.resolve(__dirname, '../../'));
const pairs = createVersionPairs(fixtures);
const results = runAlgorithms(algorithms, pairs);
const report = createBenchmarkReport({ fixtureCount: fixtures.length, pairs, results });

console.log(JSON.stringify(report, null, 2));
