'use strict';

const { normalizeForm } = require('../normalize-form');
const { deepEqual } = require('../value-utils');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'deep-equality';

/**
 * Strips the positional `order` field (the original array index) before
 * comparison. Order is preserved by normalizeForm for algorithms/consumers
 * that want it, but it must not affect equality - a category/section/input
 * being reordered in the source array is not a material change.
 * @param {object} node a normalized category/section/input node
 * @returns {object} a comparison-only clone without `order`
 */
function stripOrder(node) {
  if (Array.isArray(node)) {
    return node.map(stripOrder);
  }
  if (node !== null && typeof node === 'object') {
    const clone = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'order') continue;
      clone[key] = stripOrder(value);
    }
    return clone;
  }
  return node;
}

/**
 * Cheapest possible algorithm: normalize both sides, then run a single
 * structural equality check. If forms differ, it still points at *which*
 * top-level categories changed (by comparing each category subtree with the
 * same deepEqual routine) so the result is never completely opaque, but it
 * does not descend into section/input-level detail the way the other two
 * algorithms do.
 *
 * @param {*} previous
 * @param {*} current
 * @returns {import('../algorithm.interface').Result}
 */
function compare(previous, current) {
  const start = process.hrtime.bigint();

  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);

  let comparisonCount = 0;
  const changes = [];

  const categoryKeys = new Set([
    ...Object.keys(normalizedPrevious.categories),
    ...Object.keys(normalizedCurrent.categories),
  ]);

  for (const key of categoryKeys) {
    comparisonCount += 1;
    const previousCategory = normalizedPrevious.categories[key];
    const currentCategory = normalizedCurrent.categories[key];

    if (!previousCategory) {
      changes.push({
        scope: 'category',
        operation: 'added',
        path: key,
        previousValue: null,
        currentValue: currentCategory,
      });
      continue;
    }
    if (!currentCategory) {
      changes.push({
        scope: 'category',
        operation: 'removed',
        path: key,
        previousValue: previousCategory,
        currentValue: null,
      });
      continue;
    }
    if (!deepEqual(stripOrder(previousCategory), stripOrder(currentCategory))) {
      changes.push({
        scope: 'category',
        operation: 'updated',
        path: key,
        previousValue: previousCategory,
        currentValue: currentCategory,
      });
    }
  }

  const equal = changes.length === 0;
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const normalizedNodeCount =
    normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount;

  return createResult({
    equal,
    changes,
    metadata: buildMetadata({
      algorithm: NAME,
      durationMs,
      comparisonCount,
      normalizedNodeCount,
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
};
