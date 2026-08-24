'use strict';

const { normalizeForm } = require('../normalize-form');
const { fingerprint } = require('../value-utils');
const { analyzeOrdering } = require('../ordering');
const { classify } = require('../verdict');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'tree-edit-distance';

/**
 * Classic Zhang-Shasha (1989) tree edit distance on the form tree.
 *
 * The algorithm computes the cheapest sequence of insert / delete / relabel
 * operations that turns the previous tree into the current one, giving a
 * mathematically minimal alignment. Complexity is O(n1 * n2 * min(d1, l1) *
 * min(d2, l2)) where n = node count, d = depth, l = leaf count - orders of
 * magnitude slower than the keyed algorithms, but it does not need stable
 * keys to line nodes up: identity comes from the edit script.
 *
 * Because the raw edit script only speaks in insert / delete / relabel, we
 * post-process it into our operations:
 *
 *   match          -> (dropped, subtree unchanged)
 *   relabel(i, j)  -> `modified` when keys match, `renamed` when only the key
 *                     differs (fields fingerprint identity is equal)
 *   delete + insert with matching identity fingerprints -> paired as `renamed`
 *   remaining delete -> `removed`
 *   remaining insert -> `added`
 *
 * A virtual root wraps the categories so the forest becomes a single tree.
 */

function collectChildren(node) {
  if (node.scope === 'root') return node.children;
  if (node.scope === 'category') return Object.values(node.sections);
  if (node.scope === 'section') return Object.values(node.inputs);
  return [];
}

function postorderFlatten(normalized) {
  const virtualRoot = {
    key: '__root__',
    path: '',
    scope: 'root',
    fields: {},
    children: Object.values(normalized.categories),
  };

  const nodes = [null];
  const label = [null];
  const identity = [null];
  const lld = [null];
  let hashCount = 0;

  const walk = (node) => {
    const children = collectChildren(node);
    const childInfo = children.map((child) => walk(child));

    const index = nodes.length;
    nodes.push(node);
    const contentFp = fingerprint({
      scope: node.scope,
      key: node.key,
      fields: node.fields,
      children: childInfo.map((info) => info.label),
    });
    const { key: _key, path: _path, ...identityFields } = node.fields || {};
    const identityFp = fingerprint({
      scope: node.scope,
      fields: identityFields,
      children: childInfo.map((info) => info.identity),
    });
    hashCount += 2;
    label.push(contentFp);
    identity.push(identityFp);
    lld.push(childInfo.length > 0 ? childInfo[0].lld : index);
    return { index, label: contentFp, identity: identityFp, lld: lld[index] };
  };

  walk(virtualRoot);

  const keyrootsByLld = new Map();
  for (let index = 1; index < lld.length; index += 1) {
    keyrootsByLld.set(lld[index], index);
  }
  const keyroots = [...keyrootsByLld.values()].sort((left, right) => left - right);

  return { nodes, label, identity, lld, keyroots, n: nodes.length - 1, hashCount };
}

/**
 * Full Zhang-Shasha: computes treedist for every keyroot pair, saving the
 * parent-pointer matrix per keyroot pair so the alignment can be backtraced.
 */
function zhangShasha(tree1, tree2) {
  const { label: label1, lld: lld1, keyroots: kr1, n: n1 } = tree1;
  const { label: label2, lld: lld2, keyroots: kr2, n: n2 } = tree2;

  const treedist = Array.from({ length: n1 + 1 }, () => new Array(n2 + 1).fill(0));
  const parents = new Map(); // key `${i},${j}` -> { fd, parent, li, lj }
  let cellCount = 0;

  for (const i of kr1) {
    for (const j of kr2) {
      const li = lld1[i];
      const lj = lld2[j];
      const fd = Array.from({ length: i + 1 }, () => new Array(j + 1).fill(0));
      const parent = Array.from({ length: i + 1 }, () => new Array(j + 1).fill(null));

      fd[li - 1][lj - 1] = 0;
      for (let ip = li; ip <= i; ip += 1) {
        fd[ip][lj - 1] = fd[ip - 1][lj - 1] + 1;
        parent[ip][lj - 1] = 'del';
      }
      for (let jp = lj; jp <= j; jp += 1) {
        fd[li - 1][jp] = fd[li - 1][jp - 1] + 1;
        parent[li - 1][jp] = 'ins';
      }

      for (let ip = li; ip <= i; ip += 1) {
        for (let jp = lj; jp <= j; jp += 1) {
          cellCount += 1;
          const del = fd[ip - 1][jp] + 1;
          const ins = fd[ip][jp - 1] + 1;

          if (lld1[ip] === li && lld2[jp] === lj) {
            const relCost = label1[ip] === label2[jp] ? 0 : 1;
            const rel = fd[ip - 1][jp - 1] + relCost;
            const best = Math.min(del, ins, rel);
            fd[ip][jp] = best;
            if (best === rel) parent[ip][jp] = 'rel';
            else if (best === del) parent[ip][jp] = 'del';
            else parent[ip][jp] = 'ins';
            treedist[ip][jp] = fd[ip][jp];
          } else {
            const jump = fd[lld1[ip] - 1][lld2[jp] - 1] + treedist[ip][jp];
            const best = Math.min(del, ins, jump);
            fd[ip][jp] = best;
            if (best === jump) parent[ip][jp] = 'jump';
            else if (best === del) parent[ip][jp] = 'del';
            else parent[ip][jp] = 'ins';
          }
        }
      }

      parents.set(`${i},${j}`, { parent, li, lj });
    }
  }

  return { treedist, parents, distance: treedist[n1][n2], cellCount };
}

/**
 * Backtraces the alignment starting from (n1, n2). Returns an array of
 * { op, i?, j? } script entries in reverse chronological order (rightmost
 * choice first) - order doesn't matter for our downstream translation.
 */
function backtrace(tree1, tree2, parents) {
  const script = [];
  const stack = [{ i: tree1.n, j: tree2.n }];

  while (stack.length > 0) {
    const { i, j } = stack.pop();
    const entry = parents.get(`${i},${j}`);
    if (!entry) continue;
    const { parent, li, lj } = entry;
    let ip = i;
    let jp = j;

    while (!(ip === li - 1 && jp === lj - 1)) {
      if (ip < li) {
        script.push({ op: 'ins', j: jp });
        jp -= 1;
        continue;
      }
      if (jp < lj) {
        script.push({ op: 'del', i: ip });
        ip -= 1;
        continue;
      }
      const choice = parent[ip][jp];
      if (choice === 'del') {
        script.push({ op: 'del', i: ip });
        ip -= 1;
      } else if (choice === 'ins') {
        script.push({ op: 'ins', j: jp });
        jp -= 1;
      } else if (choice === 'rel') {
        if (tree1.label[ip] === tree2.label[jp]) {
          script.push({ op: 'match', i: ip, j: jp });
        } else {
          script.push({ op: 'rel', i: ip, j: jp });
        }
        ip -= 1;
        jp -= 1;
      } else if (choice === 'jump') {
        stack.push({ i: ip, j: jp });
        ip = tree1.lld[ip] - 1;
        jp = tree2.lld[jp] - 1;
      } else {
        break;
      }
    }
  }

  return script;
}

/**
 * Post-processes the raw edit script into our operation vocabulary. Deletes
 * and inserts are bucketed by identity fingerprint so a pair with the same
 * identity becomes a `renamed`. Relabels are `modified` when the key stayed
 * the same, `renamed` when only the key changed.
 */
function scriptToChanges(script, tree1, tree2) {
  const removals = [];
  const additions = [];
  const modifications = [];
  const renames = [];

  for (const entry of script) {
    if (entry.op === 'match') continue;

    if (entry.op === 'rel') {
      const oldNode = tree1.nodes[entry.i];
      const newNode = tree2.nodes[entry.j];
      if (oldNode.scope === 'root' || newNode.scope === 'root') continue;

      if (tree1.identity[entry.i] === tree2.identity[entry.j] && oldNode.key !== newNode.key) {
        renames.push({
          operation: 'renamed',
          scope: newNode.scope,
          from: oldNode.path,
          to: newNode.path,
          key: { from: oldNode.key, to: newNode.key },
        });
        continue;
      }

      modifications.push({
        operation: 'modified',
        scope: newNode.scope,
        path: newNode.path,
        previousFields: oldNode.fields,
        currentFields: newNode.fields,
      });
      continue;
    }

    if (entry.op === 'del') {
      const node = tree1.nodes[entry.i];
      if (node.scope === 'root') continue;
      removals.push({ index: entry.i, node });
    } else if (entry.op === 'ins') {
      const node = tree2.nodes[entry.j];
      if (node.scope === 'root') continue;
      additions.push({ index: entry.j, node });
    }
  }

  const buckets = new Map();
  for (const removal of removals) {
    const identityHash = tree1.identity[removal.index];
    if (!buckets.has(identityHash)) buckets.set(identityHash, []);
    buckets.get(identityHash).push(removal);
  }

  const matchedAdditions = new Set();
  for (const addition of additions) {
    const identityHash = tree2.identity[addition.index];
    const candidates = buckets.get(identityHash);
    if (!candidates || candidates.length === 0) continue;
    const match = candidates.shift();
    matchedAdditions.add(addition);
    renames.push({
      operation: 'renamed',
      scope: addition.node.scope,
      from: match.node.path,
      to: addition.node.path,
      key: { from: match.node.key, to: addition.node.key },
    });
  }

  const unmatchedRemovals = [];
  for (const bucket of buckets.values()) unmatchedRemovals.push(...bucket);

  const changes = [
    ...renames,
    ...unmatchedRemovals.map(({ node }) => ({
      operation: 'removed',
      scope: node.scope,
      path: node.path,
      node: { key: node.key, fields: node.fields },
    })),
    ...additions
      .filter((addition) => !matchedAdditions.has(addition))
      .map(({ node }) => ({
        operation: 'added',
        scope: node.scope,
        path: node.path,
        node: { key: node.key, fields: node.fields },
      })),
    ...modifications,
  ];

  return changes;
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

  const tree1 = postorderFlatten(normalizedPrevious);
  const tree2 = postorderFlatten(normalizedCurrent);

  const { parents, distance, cellCount } = zhangShasha(tree1, tree2);
  const script = backtrace(tree1, tree2, parents);
  const changes = scriptToChanges(script, tree1, tree2);

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
      comparisonCount: cellCount + ordering.comparisons,
      normalizedNodeCount:
        normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount,
      hashCount: tree1.hashCount + tree2.hashCount,
      editDistance: distance,
      treeSize: { previous: tree1.n, current: tree2.n },
      dpCells: cellCount,
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
};
