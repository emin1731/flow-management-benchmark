'use strict';

const { create } = require('jsondiffpatch');
const { normalizeForm } = require('../normalize-form');
const { analyzeOrdering } = require('../ordering');
const { classify } = require('../verdict');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'jsondiffpatch-keyed';

/**
 * Off-the-shelf diff using the `jsondiffpatch` library with `objectHash`
 * set to each node's stable `.key`. Categories, sections and inputs are
 * converted to arrays first so that jsondiffpatch's keyed-array matching
 * kicks in - that is what lets it survive a reorder without reporting the
 * whole tail as changed.
 *
 * jsondiffpatch matches nodes by objectHash. If a node's key changes it is
 * NOT the same node any more, so a rename shows up as remove + add - same
 * conservative behaviour as the other keyed algorithms. Cross-parent moves
 * are also remove + add because each parent has its own array.
 *
 * Position-only moves inside one parent are reported by jsondiffpatch as
 * array-move deltas, but we drop them here and let `analyzeOrdering` be the
 * single source of truth for reordering - otherwise the same physical move
 * would be double-counted in `changes[]` and in `ordering.moved`.
 */

/**
 * Every array item needs a stable identity or jsondiffpatch drops back to
 * something that does not preserve identical arrays across a deep clone.
 * We prefer `.key` (the form node identity), fall back to `.value` for enum
 * entries, and fall back to the position for anything else.
 */
const patcher = create({
  objectHash: (obj, index) => {
    if (obj && typeof obj === 'object') {
      if (obj.key !== undefined && obj.key !== null) return `key:${obj.key}`;
      if (obj.value !== undefined && obj.value !== null) return `value:${obj.value}`;
    }
    return `$$index:${index}`;
  },
  arrays: { detectMove: true, includeValueOnMove: false },
  textDiff: { minLength: Infinity },
});

/**
 * Converts the object-keyed normalized tree into arrays that jsondiffpatch
 * can match by `.key`. `fields` stays as a plain object (diffed structurally
 * inside each node).
 */
function toKeyedArrays(normalized) {
  return {
    categories: Object.values(normalized.categories).map((category) => ({
      key: category.key,
      path: category.path,
      scope: 'category',
      fields: category.fields,
      sections: Object.values(category.sections).map((section) => ({
        key: section.key,
        path: section.path,
        scope: 'section',
        fields: section.fields,
        inputs: Object.values(section.inputs).map((input) => ({
          key: input.key,
          path: input.path,
          scope: 'input',
          fields: input.fields,
        })),
      })),
    })),
  };
}

/**
 * jsondiffpatch keyed-array delta shape:
 *   { _t: 'a',
 *     '<newIndex>': [value]            // addition
 *     '<newIndex>': { ...nested... }   // in-place modification
 *     '_<oldIndex>': [value, 0, 0]     // deletion
 *     '_<oldIndex>': ['', newIdx, 3]   // position-only move
 *   }
 */
function walkArrayDelta(delta, previousArray, currentArray, scope, changes, counters) {
  if (!delta || delta._t !== 'a') return;

  for (const [deltaKey, entry] of Object.entries(delta)) {
    if (deltaKey === '_t') continue;
    counters.deltaEntries += 1;

    if (deltaKey.startsWith('_')) {
      const oldIndex = Number(deltaKey.slice(1));
      const oldItem = previousArray[oldIndex];
      if (!Array.isArray(entry)) continue;
      const marker = entry[2];
      if (marker === 0) {
        changes.push({
          operation: 'removed',
          scope,
          path: oldItem.path,
          node: { key: oldItem.key, fields: oldItem.fields },
        });
      }
      // marker === 3 is a position-only move; analyzeOrdering handles it.
      continue;
    }

    const newIndex = Number(deltaKey);
    if (Array.isArray(entry)) {
      if (entry.length === 1) {
        const newItem = entry[0];
        changes.push({
          operation: 'added',
          scope,
          path: newItem.path,
          node: { key: newItem.key, fields: newItem.fields },
        });
      }
      continue;
    }

    // Nested delta on an existing item: descend.
    const newItem = currentArray[newIndex];
    const oldItem = previousArray.find((candidate) => candidate.key === newItem.key);
    if (!oldItem) continue;

    if (entry.fields) {
      changes.push({
        operation: 'modified',
        scope,
        path: newItem.path,
        previousFields: oldItem.fields,
        currentFields: newItem.fields,
      });
    }

    if (scope === 'category' && entry.sections) {
      walkArrayDelta(entry.sections, oldItem.sections, newItem.sections, 'section', changes, counters);
    }
    if (scope === 'section' && entry.inputs) {
      walkArrayDelta(entry.inputs, oldItem.inputs, newItem.inputs, 'input', changes, counters);
    }
  }
}

/**
 * @param {*} previous
 * @param {*} current
 * @returns {import('../algorithm.interface').Result}
 */
function compare(previous, current) {
  const start = process.hrtime.bigint();

  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);

  const keyedPrevious = toKeyedArrays(normalizedPrevious);
  const keyedCurrent = toKeyedArrays(normalizedCurrent);

  const delta = patcher.diff(keyedPrevious, keyedCurrent);
  const changes = [];
  const counters = { deltaEntries: 0 };

  if (delta && delta.categories) {
    walkArrayDelta(
      delta.categories,
      keyedPrevious.categories,
      keyedCurrent.categories,
      'category',
      changes,
      counters,
    );
  }

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
      comparisonCount: counters.deltaEntries + ordering.comparisons,
      normalizedNodeCount:
        normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount,
      deltaEntries: counters.deltaEntries,
      library: 'jsondiffpatch',
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
};
