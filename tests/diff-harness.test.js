const path = require('node:path');
const { createVersionPairs, discoverFixtures } = require('../src/diff/fixture-loader');
const { runAlgorithm } = require('../src/diff/runner');
const { normalizeForm } = require('../src/diff/normalize-form');
const { canonicalStringify, deepEqual, fingerprint } = require('../src/diff/value-utils');
const { compareSiblingOrder, longestIncreasingSubsequence } = require('../src/diff/ordering');
const { compareValidations, compareEnumLists } = require('../src/diff/verdict');
const { algorithms, getAlgorithm } = require('../src/diff/algorithms');
const { buildScenarios } = require('../src/diff/scenarios');
const { collectNodePaths, scoreResult, toNodePath } = require('../src/diff/scoring');
const { decideVersion, checkConcurrency } = require('../src/diff/version-decision');

const fixturesDirectory = path.resolve(__dirname, '..');

describe('fixture loading', () => {
  it('discovers and orders form versions', () => {
    const fixtures = discoverFixtures(fixturesDirectory);
    expect(fixtures.map((fixture) => fixture.version)).toEqual([1, 2, 3, 4]);
  });

  it('creates adjacent version pairs', () => {
    const pairs = createVersionPairs(discoverFixtures(fixturesDirectory));
    expect(pairs.map((pair) => [pair.from.version, pair.to.version])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });
});

describe('value-utils', () => {
  it('serializes object keys in a stable order', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it('treats null and undefined as the same absent value', () => {
    expect(deepEqual(null, undefined)).toBe(true);
    expect(deepEqual({ a: null }, {})).toBe(false);
  });

  it('produces a stable fingerprint regardless of key order', () => {
    expect(fingerprint({ x: 1, y: [1, 2] })).toBe(fingerprint({ y: [1, 2], x: 1 }));
  });
});

describe('normalize-form', () => {
  const fixture = require('../form-template-v1.json');

  it('builds the tree from formData, not sortedKeys', () => {
    const normalized = normalizeForm(fixture);
    const input =
      normalized.categories.serviceInformation.sections.serviceNameAndDescription.inputs.serviceId;

    // These fields exist ONLY in formData - if the tree were built from
    // sortedKeys they would all be missing and no breaking change could be found.
    expect(input.fields.dataType).toBeDefined();
    expect(input.fields.isRequired).toBeDefined();
    expect(input.fields.validations).toBeDefined();
    expect(input.fields.enumList).toBeDefined();
  });

  it('accepts both the API envelope and an unwrapped template', () => {
    const fromEnvelope = normalizeForm(fixture);
    const fromPayload = normalizeForm(fixture.data);
    expect(fromPayload.meta.normalizedNodeCount).toBe(fromEnvelope.meta.normalizedNodeCount);
  });

  it('rejects a payload without formData', () => {
    expect(() => normalizeForm({ data: { sortedKeys: [] } })).toThrow(/formData/);
  });

  it('keeps order out of the comparable field bag', () => {
    const normalized = normalizeForm(fixture);
    const category = normalized.categories.serviceInformation;
    expect(category.fields.orderIndex).toBeUndefined();
    expect(typeof category.order).toBe('number');
  });
});

describe('ordering', () => {
  it('reports no movement when an item is inserted at the front', () => {
    const result = compareSiblingOrder(['a', 'b', 'c'], ['z', 'a', 'b', 'c'], 'p', 'input');
    expect(result.moved).toHaveLength(0);
  });

  it('reports only the item that actually moved', () => {
    const result = compareSiblingOrder(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'], 'p', 'input');
    expect(result.moved.map((entry) => entry.key)).toEqual(['d']);
  });

  it('computes a longest increasing subsequence', () => {
    expect([...longestIncreasingSubsequence([0, 1, 2])].sort()).toEqual([0, 1, 2]);
  });
});

describe('verdict helpers', () => {
  it('classifies a lowered maxLength as tightened', () => {
    expect(compareValidations({ maxLength: 200 }, { maxLength: 10 }).tightened).toContain('maxLength');
  });

  it('classifies a raised maxLength as relaxed', () => {
    expect(compareValidations({ maxLength: 50 }, { maxLength: 4096 }).relaxed).toContain('maxLength');
  });

  it('treats a newly introduced cap as a tightening', () => {
    expect(compareValidations({}, { maxLength: 64 }).tightened).toContain('maxLength');
  });

  it('compares enum lists by identity, not position', () => {
    const previous = [{ key: 'a' }, { key: 'b' }];
    const reordered = [{ key: 'b' }, { key: 'a' }];
    const result = compareEnumLists(previous, reordered);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });
});

describe('scoring', () => {
  it('folds a field-level path back onto its owning node', () => {
    const known = new Set(['cat.sec.input']);
    expect(toNodePath('cat.sec.inputs.input.label', known)).toBe('cat.sec.input');
    expect(toNodePath('cat.sec.input.validations.maxLength', known)).toBe('cat.sec.input');
  });
});

describe('algorithm registry', () => {
  it('registers all four algorithms', () => {
    expect(algorithms.map((algorithm) => algorithm.name)).toEqual([
      'deep-equality',
      'recursive-json-diff',
      'hierarchical-keyed-diff',
      'fingerprint-flatten',
    ]);
  });

  it('throws for an unknown algorithm', () => {
    expect(() => getAlgorithm('nope')).toThrow(/Unknown algorithm/);
  });

  it('runs an algorithm through the shared result contract', () => {
    const pairs = createVersionPairs(discoverFixtures(fixturesDirectory));
    const result = runAlgorithm(getAlgorithm('fingerprint-flatten'), pairs[0]);
    expect(result).toMatchObject({ algorithm: 'fingerprint-flatten', fromVersion: 1, toVersion: 2 });
  });
});

describe('scenarios and ground truth', () => {
  const scenarios = buildScenarios();

  it('covers the full change taxonomy', () => {
    const names = scenarios.map((scenario) => scenario.name);
    for (const required of [
      'identical',
      'transport-only',
      'input-renamed',
      'input-moved',
      'input-reordered',
      'datatype-changed',
      'optional-became-required',
      'enum-value-removed',
      'validation-tightened',
      'validation-relaxed',
    ]) {
      expect(names).toContain(required);
    }
  });

  it.each(buildScenarios().map((scenario) => [scenario.name, scenario]))(
    'fingerprint-flatten satisfies "%s"',
    (_name, scenario) => {
      const known = collectNodePaths(
        normalizeForm(scenario.previous),
        normalizeForm(scenario.current)
      );
      const result = getAlgorithm('fingerprint-flatten').compare(scenario.previous, scenario.current);
      const score = scoreResult(scenario, result, known);
      expect(score.checks.filter((check) => check.passed === false)).toEqual([]);
    }
  );

  it('treats a transport-only change as equal', () => {
    const scenario = scenarios.find((entry) => entry.name === 'transport-only');
    for (const algorithm of algorithms) {
      expect(algorithm.compare(scenario.previous, scenario.current).equal).toBe(true);
    }
  });
});

describe('version decision', () => {
  const fixture = require('../form-template-v1.json');
  const v2 = require('../form-template-v2.json');

  it('keeps the version when nothing changed', () => {
    const decision = decideVersion({ currentVersion: 3, storedForm: fixture, incomingForm: fixture });
    expect(decision).toMatchObject({ isEqual: true, shouldCreateVersion: false, nextVersion: 3 });
  });

  it('increments by exactly one when content differs', () => {
    const decision = decideVersion({ currentVersion: 3, storedForm: fixture, incomingForm: v2 });
    expect(decision).toMatchObject({ shouldCreateVersion: true, currentVersion: 3, nextVersion: 4 });
  });

  it('rejects a version below 1', () => {
    expect(() =>
      decideVersion({ currentVersion: 0, storedForm: fixture, incomingForm: v2 })
    ).toThrow(RangeError);
  });

  it('does not mutate its inputs', () => {
    const before = JSON.stringify(fixture);
    decideVersion({ currentVersion: 1, storedForm: fixture, incomingForm: v2 });
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('is deterministic', () => {
    const first = decideVersion({ currentVersion: 1, storedForm: fixture, incomingForm: v2 });
    const second = decideVersion({ currentVersion: 1, storedForm: fixture, incomingForm: v2 });
    expect(first.changes).toEqual(second.changes);
  });

  it('flags a stale decision when the active version moved', () => {
    expect(checkConcurrency(3, 4).stale).toBe(true);
    expect(checkConcurrency(3, 3).stale).toBe(false);
  });
});
