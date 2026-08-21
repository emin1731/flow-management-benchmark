const path = require('node:path');
const { createVersionPairs, discoverFixtures } = require('../src/diff/fixture-loader');
const { runAlgorithm } = require('../src/diff/runner');

const fixturesDirectory = path.resolve(__dirname, '..');

describe('diff experiment harness', () => {
  it('discovers and orders form versions without comparing them', () => {
    const fixtures = discoverFixtures(fixturesDirectory);

    expect(fixtures.map((fixture) => fixture.version)).toEqual([1, 2, 3, 4]);
    expect(fixtures.every((fixture) => fixture.form.data.sortedKeys.length > 0)).toBe(true);
  });

  it('creates adjacent version pairs for experiments', () => {
    const pairs = createVersionPairs(discoverFixtures(fixturesDirectory));

    expect(pairs.map((pair) => [pair.from.version, pair.to.version])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it('runs an algorithm through the shared result contract', () => {
    const fixtures = discoverFixtures(fixturesDirectory);
    const algorithm = {
      name: 'test-placeholder',
      compare: (previous, current) => ({
        equal: previous === current,
        changes: [],
      }),
    };

    expect(runAlgorithm(algorithm, createVersionPairs(fixtures)[0])).toMatchObject({
      algorithm: 'test-placeholder',
      fromVersion: 1,
      toVersion: 2,
      equal: false,
      changes: [],
    });
  });
});
