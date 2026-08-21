'use strict';

const { normalizeForm } = require('../normalize-form');
const { fingerprint } = require('../value-utils');
const { analyzeOrdering } = require('../ordering');
const { classify } = require('../verdict');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'fingerprint-flatten';

/**
 * Every node carries two fingerprints, and the distinction is what makes
 * rename detection possible at all:
 *
 *   contentFingerprint  - includes `key`. Answers "is this node unchanged?"
 *   identityFingerprint - EXCLUDES `key` and `path`. Answers "is this the same
 *                         node wearing a different name?"
 *
 * Using only the content fingerprint, a rename changes the hash and could
 * never be paired with its removal.
 *
 * Parent nodes fold their children's content fingerprints into a
 * subtreeFingerprint, so an unchanged section can be skipped whole.
 *
 * @param {object} node normalized node
 * @param {string[]} childFingerprints
 * @returns {{content: string, identity: string, subtree: string}}
 */
function fingerprintNode(node, childFingerprints) {
  const { key, path, ...identityFreeFields } = node.fields;

  const content = fingerprint(node.fields);
  const identity = fingerprint(identityFreeFields);
  const subtree = fingerprint([content, ...childFingerprints]);

  return { content, identity, subtree };
}

/**
 * Step 0 + Step 1 combined: one pass that fingerprints every node and flattens
 * the tree into a path-addressed map. Merging them means the template is walked
 * once, not twice.
 *
 * @param {object} normalized
 * @returns {{nodes: Map<string, object>, rootFingerprint: string, hashCount: number}}
 */
function flattenWithFingerprints(normalized) {
  const nodes = new Map();
  let hashCount = 0;

  const categoryFingerprints = [];

  for (const category of Object.values(normalized.categories)) {
    const sectionFingerprints = [];

    for (const section of Object.values(category.sections)) {
      const inputFingerprints = [];

      for (const input of Object.values(section.inputs)) {
        const marks = fingerprintNode(input, []);
        hashCount += 3;
        nodes.set(input.path, {
          scope: 'input',
          key: input.key,
          parentPath: section.path,
          order: input.order,
          fields: input.fields,
          ...marks,
        });
        inputFingerprints.push(marks.content);
      }

      const marks = fingerprintNode(section, inputFingerprints);
      hashCount += 3;
      nodes.set(section.path, {
        scope: 'section',
        key: section.key,
        parentPath: category.path,
        order: section.order,
        fields: section.fields,
        ...marks,
      });
      sectionFingerprints.push(marks.subtree);
    }

    const marks = fingerprintNode(category, sectionFingerprints);
    hashCount += 3;
    nodes.set(category.path, {
      scope: 'category',
      key: category.key,
      parentPath: '',
      order: category.order,
      fields: category.fields,
      ...marks,
    });
    categoryFingerprints.push(marks.subtree);
  }

  return {
    nodes,
    rootFingerprint: fingerprint(categoryFingerprints),
    hashCount: hashCount + 1,
  };
}

/**
 * Step 3: pair removals with additions.
 *
 * Nodes are bucketed by identityFingerprint, so pairing is a single pass rather
 * than the |removed| x |added| comparison a similarity score would require.
 * Matching is exact, which means a node renamed AND edited in the same publish
 * will not pair and falls back to remove + add - the conservative failure,
 * over-reporting breakage rather than hiding it.
 *
 * Candidates are sorted by path so that ties resolve deterministically.
 *
 * @param {Array} removed
 * @param {Array} added
 * @returns {{pairs: Array, unmatchedRemoved: Array, unmatchedAdded: Array, ambiguous: Array}}
 */
function pairRenamesAndMoves(removed, added) {
  const buckets = new Map();
  for (const entry of [...removed].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!buckets.has(entry.identity)) buckets.set(entry.identity, []);
    buckets.get(entry.identity).push(entry);
  }

  const pairs = [];
  const ambiguous = [];
  const matchedAdded = new Set();

  for (const entry of [...added].sort((left, right) => left.path.localeCompare(right.path))) {
    const candidates = buckets.get(entry.identity);
    if (!candidates || candidates.length === 0) continue;

    if (candidates.length > 1) {
      ambiguous.push({
        to: entry.path,
        candidates: candidates.map((candidate) => candidate.path),
        resolvedTo: candidates[0].path,
      });
    }

    const match = candidates.shift();
    matchedAdded.add(entry.path);

    const sameKey = match.key === entry.key;
    const sameParent = match.parentPath === entry.parentPath;

    let operation = 'moved+renamed';
    if (sameKey && !sameParent) operation = 'moved';
    else if (!sameKey && sameParent) operation = 'renamed';
    else if (sameKey && sameParent) operation = 'moved';

    pairs.push({
      operation,
      scope: entry.scope,
      from: match.path,
      to: entry.path,
      key: { from: match.key, to: entry.key },
    });
  }

  const stillRemoved = [];
  for (const bucket of buckets.values()) stillRemoved.push(...bucket);

  return {
    pairs,
    unmatchedRemoved: stillRemoved,
    unmatchedAdded: added.filter((entry) => !matchedAdded.has(entry.path)),
    ambiguous,
  };
}

/**
 * Fingerprint-and-flatten diff.
 *
 * Pipeline: fingerprint -> flatten -> set diff -> pair renames/moves ->
 * ordering -> compatibility verdict.
 *
 * Unlike the other three algorithms this one reports renames and moves,
 * analyses ordering separately from structure, and produces a
 * safe / requires-review / breaking verdict with the migrations each breaking
 * change implies.
 *
 * Complexity: O(N) for the fingerprint + flatten pass (N = serialized bytes),
 * O(n) for the set diff and pairing, O(n log n) for ordering.
 *
 * @param {*} previous
 * @param {*} current
 * @returns {import('../algorithm.interface').Result}
 */
function compare(previous, current) {
  const start = process.hrtime.bigint();

  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);

  const flatPrevious = flattenWithFingerprints(normalizedPrevious);
  const flatCurrent = flattenWithFingerprints(normalizedCurrent);

  let comparisonCount = 0;
  let skippedSubtrees = 0;

  // Whole-form early exit: identical roots mean nothing below can differ.
  if (flatPrevious.rootFingerprint === flatCurrent.rootFingerprint) {
    const ordering = analyzeOrdering(normalizedPrevious, normalizedCurrent);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    return createResult({
      equal: !ordering.reordered,
      changes: [],
      ordering,
      verdict: classify([], ordering),
      metadata: buildMetadata({
        algorithm: NAME,
        durationMs,
        comparisonCount: 1,
        normalizedNodeCount:
          normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount,
        hashCount: flatPrevious.hashCount + flatCurrent.hashCount,
        earlyExit: true,
        skippedSubtrees: flatPrevious.nodes.size,
      }),
    });
  }

  const decorate = (path, entry) => ({ path, ...entry });

  const removed = [];
  const added = [];
  const modified = [];

  for (const [path, entry] of flatPrevious.nodes) {
    comparisonCount += 1;
    if (!flatCurrent.nodes.has(path)) removed.push(decorate(path, entry));
  }

  for (const [path, entry] of flatCurrent.nodes) {
    comparisonCount += 1;
    const before = flatPrevious.nodes.get(path);
    if (!before) {
      added.push(decorate(path, entry));
      continue;
    }
    if (before.subtree === entry.subtree) {
      skippedSubtrees += 1;
      continue;
    }
    if (before.content !== entry.content) {
      modified.push({ path, before, after: entry });
    }
  }

  const { pairs, unmatchedRemoved, unmatchedAdded, ambiguous } = pairRenamesAndMoves(removed, added);

  const changes = [
    ...pairs,
    ...unmatchedRemoved.map((entry) => ({
      operation: 'removed',
      scope: entry.scope,
      path: entry.path,
      node: { key: entry.key, fields: entry.fields },
    })),
    ...unmatchedAdded.map((entry) => ({
      operation: 'added',
      scope: entry.scope,
      path: entry.path,
      node: { key: entry.key, fields: entry.fields },
    })),
    ...modified.map(({ path, before, after }) => ({
      operation: 'modified',
      scope: after.scope,
      path,
      previousFields: before.fields,
      currentFields: after.fields,
    })),
  ];

  const ordering = analyzeOrdering(normalizedPrevious, normalizedCurrent);
  const verdict = classify(changes, ordering);

  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

  return createResult({
    equal: changes.length === 0 && !ordering.reordered,
    changes,
    ordering,
    verdict,
    metadata: buildMetadata({
      algorithm: NAME,
      durationMs,
      comparisonCount: comparisonCount + ordering.comparisons,
      normalizedNodeCount:
        normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount,
      hashCount: flatPrevious.hashCount + flatCurrent.hashCount,
      skippedSubtrees,
      renamePairs: pairs.length,
      ambiguousMatches: ambiguous,
      earlyExit: false,
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
  flattenWithFingerprints,
  pairRenamesAndMoves,
};
