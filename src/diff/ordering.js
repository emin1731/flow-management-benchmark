'use strict';

/**
 * Longest increasing subsequence over an array of numbers, returned as the set
 * of ARRAY INDEXES that belong to the subsequence.
 *
 * Patience sorting: O(n log n) rather than the O(n^2) dynamic-programming LCS
 * that produces the same answer for this problem.
 *
 * @param {number[]} sequence
 * @returns {Set<number>}
 */
function longestIncreasingSubsequence(sequence) {
  if (sequence.length === 0) return new Set();

  const tailIndexes = [];
  const predecessor = new Array(sequence.length).fill(-1);

  for (let index = 0; index < sequence.length; index += 1) {
    let low = 0;
    let high = tailIndexes.length;

    while (low < high) {
      const middle = (low + high) >> 1;
      if (sequence[tailIndexes[middle]] < sequence[index]) low = middle + 1;
      else high = middle;
    }

    if (low > 0) predecessor[index] = tailIndexes[low - 1];
    tailIndexes[low] = index;
  }

  const result = new Set();
  let cursor = tailIndexes[tailIndexes.length - 1];
  while (cursor !== -1) {
    result.add(cursor);
    cursor = predecessor[cursor];
  }
  return result;
}

/**
 * Compares the order of one sibling group.
 *
 * Only keys present on BOTH sides participate: an added or removed key is a
 * structural change, already reported by the set diff, and must not also be
 * counted as a reorder. Of the survivors, the longest run that is still in
 * ascending order is treated as having stayed put - so inserting one item at
 * the top reports exactly one move, not "everything below shifted".
 *
 * @param {string[]} previousOrder
 * @param {string[]} currentOrder
 * @param {string} parentPath
 * @param {string} scope
 * @returns {{reordered: boolean, moved: Array, comparisons: number}}
 */
function compareSiblingOrder(previousOrder, currentOrder, parentPath, scope) {
  const currentPosition = new Map(currentOrder.map((key, index) => [key, index]));
  const survivors = previousOrder.filter((key) => currentPosition.has(key));

  const positions = survivors.map((key) => currentPosition.get(key));
  const stayedIndexes = longestIncreasingSubsequence(positions);

  const moved = [];
  for (const [index, key] of survivors.entries()) {
    if (stayedIndexes.has(index)) continue;
    moved.push({
      scope,
      parentPath,
      key,
      path: parentPath ? `${parentPath}.${key}` : key,
      previousIndex: previousOrder.indexOf(key),
      currentIndex: currentPosition.get(key),
    });
  }

  return { reordered: moved.length > 0, moved, comparisons: survivors.length };
}

/**
 * Runs the ordering comparison across every sibling group of the form:
 * categories, the sections of each category, and the inputs of each section.
 *
 * Reported separately from field changes so that semantic equality can ignore
 * order when a caller asks it to, while still surfacing user-visible reorders.
 *
 * @param {object} previous normalized form
 * @param {object} current normalized form
 * @returns {{reordered: boolean, moved: Array, comparisons: number}}
 */
function analyzeOrdering(previous, current) {
  const moved = [];
  let comparisons = 0;

  const categoryResult = compareSiblingOrder(
    previous.order.categories,
    current.order.categories,
    '',
    'category'
  );
  moved.push(...categoryResult.moved);
  comparisons += categoryResult.comparisons;

  for (const categoryKey of Object.keys(previous.order.sections)) {
    if (!current.order.sections[categoryKey]) continue;
    const sectionResult = compareSiblingOrder(
      previous.order.sections[categoryKey],
      current.order.sections[categoryKey],
      categoryKey,
      'section'
    );
    moved.push(...sectionResult.moved);
    comparisons += sectionResult.comparisons;
  }

  for (const sectionPath of Object.keys(previous.order.inputs)) {
    if (!current.order.inputs[sectionPath]) continue;
    const inputResult = compareSiblingOrder(
      previous.order.inputs[sectionPath],
      current.order.inputs[sectionPath],
      sectionPath,
      'input'
    );
    moved.push(...inputResult.moved);
    comparisons += inputResult.comparisons;
  }

  return { reordered: moved.length > 0, moved, comparisons };
}

module.exports = { analyzeOrdering, compareSiblingOrder, longestIncreasingSubsequence };
