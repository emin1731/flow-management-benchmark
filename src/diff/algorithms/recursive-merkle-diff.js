'use strict';

const { normalizeForm } = require('../normalize-form');
const { fingerprint } = require('../value-utils');
const { analyzeOrdering } = require('../ordering');
const { classify } = require('../verdict');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'recursive-merkle-diff';

/**
 * Same fingerprints as fingerprint-flatten, but the diff walks the two trees
 * IN PARALLEL instead of flattening them into a Map first. When subtree
 * fingerprints match at a node, the whole subtree is skipped without any
 * further work.
 *
 * Rename / move detection happens PER-PARENT: at each sibling group the
 * algorithm pairs unmatched removed children with unmatched added children
 * that share the same identity fingerprint. This catches renames (same
 * parent, new key) but NOT cross-parent moves (input moved to a different
 * section). Cross-parent detection is what fingerprint-flatten's global set
 * diff buys, at the cost of always allocating the flat Map.
 */
function fingerprintNode(node, childFingerprints) {
  const { key, path, ...identityFreeFields } = node.fields;
  const content = fingerprint(node.fields);
  const identity = fingerprint(identityFreeFields);
  const subtree = fingerprint([content, ...childFingerprints]);
  return { content, identity, subtree };
}

function annotateInput(input) {
  return { ...input, marks: fingerprintNode(input, []) };
}

function annotateSection(section) {
  const inputs = {};
  const inputMarks = [];
  for (const [key, input] of Object.entries(section.inputs)) {
    const annotated = annotateInput(input);
    inputs[key] = annotated;
    inputMarks.push(annotated.marks.content);
  }
  return { ...section, inputs, marks: fingerprintNode(section, inputMarks) };
}

function annotateCategory(category) {
  const sections = {};
  const sectionMarks = [];
  for (const [key, section] of Object.entries(category.sections)) {
    const annotated = annotateSection(section);
    sections[key] = annotated;
    sectionMarks.push(annotated.marks.subtree);
  }
  return { ...category, sections, marks: fingerprintNode(category, sectionMarks) };
}

function annotate(normalized) {
  const categories = {};
  const categoryMarks = [];
  let hashCount = 0;
  for (const [key, category] of Object.entries(normalized.categories)) {
    const annotated = annotateCategory(category);
    categories[key] = annotated;
    categoryMarks.push(annotated.marks.subtree);
  }
  hashCount = countHashes(categories);
  const rootFingerprint = fingerprint(categoryMarks);
  return { categories, rootFingerprint, hashCount };
}

function countHashes(categories) {
  let count = 1;
  for (const category of Object.values(categories)) {
    count += 3;
    for (const section of Object.values(category.sections)) {
      count += 3;
      for (const _input of Object.values(section.inputs)) {
        count += 3;
      }
    }
  }
  return count;
}

/**
 * Pairs unmatched removals with additions inside a single sibling group.
 * Identical fingerprint = same node under a new key = rename.
 */
function pairRenamesInGroup(scope, parentPath, removed, added) {
  const buckets = new Map();
  for (const entry of [...removed].sort((left, right) => left.key.localeCompare(right.key))) {
    if (!buckets.has(entry.marks.identity)) buckets.set(entry.marks.identity, []);
    buckets.get(entry.marks.identity).push(entry);
  }

  const pairs = [];
  const matchedAdded = new Set();
  const ambiguous = [];

  for (const entry of [...added].sort((left, right) => left.key.localeCompare(right.key))) {
    const candidates = buckets.get(entry.marks.identity);
    if (!candidates || candidates.length === 0) continue;
    if (candidates.length > 1) {
      ambiguous.push({
        to: entry.path,
        candidates: candidates.map((candidate) => candidate.path),
        resolvedTo: candidates[0].path,
      });
    }
    const match = candidates.shift();
    matchedAdded.add(entry.key);
    pairs.push({
      operation: 'renamed',
      scope,
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
    unmatchedAdded: added.filter((entry) => !matchedAdded.has(entry.key)),
    ambiguous,
  };
}

function diffChildren(scope, parentPath, previousChildren, currentChildren, descendFn, changes, counters) {
  const previousKeys = new Set(Object.keys(previousChildren));
  const currentKeys = new Set(Object.keys(currentChildren));

  const removed = [];
  const added = [];
  const bothSides = [];

  for (const key of previousKeys) {
    counters.comparisons += 1;
    if (!currentKeys.has(key)) removed.push(previousChildren[key]);
    else bothSides.push(key);
  }
  for (const key of currentKeys) {
    counters.comparisons += 1;
    if (!previousKeys.has(key)) added.push(currentChildren[key]);
  }

  const { pairs, unmatchedRemoved, unmatchedAdded, ambiguous } = pairRenamesInGroup(
    scope, parentPath, removed, added
  );

  counters.renamePairs += pairs.length;
  counters.ambiguous.push(...ambiguous);

  for (const pair of pairs) changes.push(pair);
  for (const entry of unmatchedRemoved) {
    changes.push({
      operation: 'removed',
      scope,
      path: entry.path,
      node: { key: entry.key, fields: entry.fields },
    });
  }
  for (const entry of unmatchedAdded) {
    changes.push({
      operation: 'added',
      scope,
      path: entry.path,
      node: { key: entry.key, fields: entry.fields },
    });
  }

  for (const key of bothSides) {
    const before = previousChildren[key];
    const after = currentChildren[key];
    counters.comparisons += 1;
    if (before.marks.subtree === after.marks.subtree) {
      counters.skippedSubtrees += 1;
      continue;
    }
    descendFn(before, after, changes, counters);
  }
}

function diffInputs(previousSection, currentSection, changes, counters) {
  diffChildren(
    'input',
    previousSection.path,
    previousSection.inputs,
    currentSection.inputs,
    (before, after) => {
      if (before.marks.content !== after.marks.content) {
        changes.push({
          operation: 'modified',
          scope: 'input',
          path: after.path,
          previousFields: before.fields,
          currentFields: after.fields,
        });
      }
    },
    changes,
    counters,
  );
}

function diffSectionsAndDescend(previousCategory, currentCategory, changes, counters) {
  diffChildren(
    'section',
    previousCategory.path,
    previousCategory.sections,
    currentCategory.sections,
    (before, after) => {
      if (before.marks.content !== after.marks.content) {
        changes.push({
          operation: 'modified',
          scope: 'section',
          path: after.path,
          previousFields: before.fields,
          currentFields: after.fields,
        });
      }
      diffInputs(before, after, changes, counters);
    },
    changes,
    counters,
  );
}

function diffCategoriesAndDescend(previous, current, changes, counters) {
  diffChildren(
    'category',
    '',
    previous.categories,
    current.categories,
    (before, after, sink, stats) => {
      if (before.marks.content !== after.marks.content) {
        sink.push({
          operation: 'modified',
          scope: 'category',
          path: after.path,
          previousFields: before.fields,
          currentFields: after.fields,
        });
      }
      diffSectionsAndDescend(before, after, sink, stats);
    },
    changes,
    counters,
  );
}

/**
 * Recursive Merkle-tree diff. Same output shape as fingerprint-flatten but
 * with a per-parent rename scope; cross-parent moves are reported as
 * remove+add.
 *
 * Complexity: O(N) for the annotate pass, O(k) at each parent where k is the
 * number of children (no global flattening), and cheap when subtrees match.
 */
function compare(previous, current) {
  const start = process.hrtime.bigint();

  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);

  const annotatedPrevious = annotate(normalizedPrevious);
  const annotatedCurrent = annotate(normalizedCurrent);

  // Whole-form early exit: identical roots mean nothing below can differ.
  if (annotatedPrevious.rootFingerprint === annotatedCurrent.rootFingerprint) {
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
        hashCount: annotatedPrevious.hashCount + annotatedCurrent.hashCount,
        earlyExit: true,
      }),
    });
  }

  const changes = [];
  const counters = { comparisons: 0, skippedSubtrees: 0, renamePairs: 0, ambiguous: [] };

  diffCategoriesAndDescend(annotatedPrevious, annotatedCurrent, changes, counters);

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
      comparisonCount: counters.comparisons + ordering.comparisons,
      normalizedNodeCount:
        normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount,
      hashCount: annotatedPrevious.hashCount + annotatedCurrent.hashCount,
      skippedSubtrees: counters.skippedSubtrees,
      renamePairs: counters.renamePairs,
      ambiguousMatches: counters.ambiguous,
      earlyExit: false,
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
};
