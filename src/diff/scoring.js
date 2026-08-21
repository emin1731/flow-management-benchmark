'use strict';

/**
 * The four algorithms emit different change vocabularies:
 *
 *   deep-equality           { scope, operation, path }              category level only
 *   recursive-json-diff     { type, scope, path }                   path includes the field
 *   hierarchical-keyed-diff { scope, operation, categoryKey, ... }  no path at all
 *   fingerprint-flatten     { operation, scope, path | from,to }    plus renames and moves
 *
 * Scoring therefore cannot compare raw output. It extracts two normalized
 * capabilities from any result - which node paths were touched, and which
 * operations were reported - and checks those against the scenario's expected
 * ground truth.
 *
 * This is what makes the benchmark a correctness test rather than a race: an
 * algorithm that is fast but cannot tell a rename from a delete now visibly
 * fails the scenarios that matter.
 */

/**
 * Reduces a field-level path back to its node path.
 * `cat.sec.inputs.key.label` and `cat.sec.key.validations.maxLength` both
 * collapse to the node that owns them.
 *
 * @param {string} rawPath
 * @param {Set<string>} knownNodePaths
 * @returns {string|null}
 */
function toNodePath(rawPath, knownNodePaths) {
  if (!rawPath) return null;

  const cleaned = rawPath.replace(/\.inputs\./g, '.').replace(/\[\d+\]/g, '');
  const segments = cleaned.split('.');

  for (let length = Math.min(segments.length, 3); length >= 1; length -= 1) {
    const candidate = segments.slice(0, length).join('.');
    if (knownNodePaths.has(candidate)) return candidate;
  }
  return segments.slice(0, Math.min(segments.length, 3)).join('.');
}

/**
 * Extracts the node paths a change entry refers to, across all four shapes.
 *
 * @param {object} change
 * @param {Set<string>} knownNodePaths
 * @returns {string[]}
 */
function pathsOfChange(change, knownNodePaths) {
  const paths = [];

  if (change.from) paths.push(toNodePath(change.from, knownNodePaths));
  if (change.to) paths.push(toNodePath(change.to, knownNodePaths));
  if (change.path) paths.push(toNodePath(change.path, knownNodePaths));

  if (!change.path && change.categoryKey) {
    const composed = [change.categoryKey, change.sectionKey, change.inputKey].filter(Boolean).join('.');
    paths.push(composed);
  }

  return paths.filter(Boolean);
}

/**
 * @param {object} result
 * @param {Set<string>} knownNodePaths
 * @returns {{touched: Set<string>, operations: object}}
 */
function extractCapabilities(result, knownNodePaths) {
  const touched = new Set();
  const operations = {};

  for (const change of result.changes || []) {
    for (const path of pathsOfChange(change, knownNodePaths)) touched.add(path);

    const operation = change.operation || change.type || 'unknown';
    operations[operation] = (operations[operation] || 0) + 1;
  }

  return { touched, operations };
}

/**
 * Collects every valid node path from both sides of a scenario, so that
 * field-level paths can be folded back onto their owning node.
 *
 * @param {object} normalizedPrevious
 * @param {object} normalizedCurrent
 * @returns {Set<string>}
 */
function collectNodePaths(normalizedPrevious, normalizedCurrent) {
  const paths = new Set();
  for (const normalized of [normalizedPrevious, normalizedCurrent]) {
    for (const category of Object.values(normalized.categories)) {
      paths.add(category.path);
      for (const section of Object.values(category.sections)) {
        paths.add(section.path);
        for (const input of Object.values(section.inputs)) paths.add(input.path);
      }
    }
  }
  return paths;
}

/**
 * Scores one algorithm run against one scenario.
 *
 * Checks, in order of importance:
 *   equality  - did it get "are these the same form?" right
 *   touched   - did it point at the nodes that actually changed
 *   verdict   - did it classify severity correctly (only algorithms that emit one)
 *   pairing   - did it recognise a rename/move as such rather than remove + add
 *
 * @param {object} scenario
 * @param {object} result
 * @param {Set<string>} knownNodePaths
 * @returns {object}
 */
function scoreResult(scenario, result, knownNodePaths) {
  const expected = scenario.expected;
  const { touched, operations } = extractCapabilities(result, knownNodePaths);

  const checks = [];

  checks.push({
    check: 'equality',
    passed: result.equal === expected.equal,
    expected: expected.equal,
    actual: result.equal,
  });

  const missing = (expected.touched || []).filter((path) => !touched.has(path));
  checks.push({
    check: 'touched-nodes',
    passed: missing.length === 0,
    expected: expected.touched || [],
    actual: [...touched].slice(0, 10),
    ...(missing.length > 0 ? { missing } : {}),
  });

  if (result.verdict) {
    checks.push({
      check: 'verdict',
      passed: result.verdict.verdict === expected.verdict,
      expected: expected.verdict,
      actual: result.verdict.verdict,
    });
  } else {
    checks.push({ check: 'verdict', passed: null, note: 'algorithm emits no verdict' });
  }

  if (expected.requiresPairing) {
    const paired = Boolean(operations.renamed || operations.moved || operations['moved+renamed']);
    checks.push({
      check: 'rename-move-pairing',
      passed: paired,
      expected: Object.keys(expected.operations || {}).join(','),
      actual: Object.keys(operations).join(',') || 'none',
    });
  }

  if (expected.reordered) {
    const detected = Boolean(result.ordering && result.ordering.reordered);
    checks.push({
      check: 'reorder-detection',
      passed: detected,
      expected: true,
      actual: detected,
    });
  }

  const scored = checks.filter((entry) => entry.passed !== null);
  const passedCount = scored.filter((entry) => entry.passed).length;

  return {
    scenario: scenario.name,
    group: scenario.group,
    passed: passedCount === scored.length,
    score: `${passedCount}/${scored.length}`,
    checks,
    changeCount: (result.changes || []).length,
  };
}

module.exports = { collectNodePaths, extractCapabilities, scoreResult, toNodePath };
