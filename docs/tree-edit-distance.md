# Tree Edit Distance (Zhang-Shasha)

## Simple description

Classic Zhang-Shasha (1989) tree edit distance on the form tree. Instead of relying on stable keys to line nodes up, it computes the **mathematically minimum** sequence of insert / delete / relabel operations that turns the previous tree into the current one. Node identity comes out of the edit script itself, not out of the key.

Use it when you want a principled, key-free alignment — or as a correctness baseline for the keyed algorithms. Skip it in hot paths: it is orders of magnitude slower than the keyed algorithms (median ~80ms vs 1-4ms on the same fixtures).

## Steps

1. **Normalize** both templates via `normalizeForm` and wrap each in a virtual root so the forest of categories becomes a single tree.
2. **Post-order flatten** each tree. For every node compute:
   - `content` fingerprint (scope + key + fields + children's content) — the Zhang-Shasha "label".
   - `identity` fingerprint (excludes `key`) — used later to pair delete + insert pairs as renames.
   - `lld[v]` — post-order index of the leftmost leaf of the subtree rooted at `v`.
3. **Compute keyroots:** for each distinct `lld` value, take the largest node with that `lld`. Those are the roots of the dynamic-programming subproblems.
4. **Zhang-Shasha DP:** for every `(i, j)` keyroot pair, fill a `forestdist` matrix using the standard recurrence:
   - `forestdist[i'-1][j'] + 1` (delete `i'`)
   - `forestdist[i'][j'-1] + 1` (insert `j'`)
   - if both are keyroots-of-current-subtree: `forestdist[i'-1][j'-1] + (label match ? 0 : 1)` (relabel).
   - otherwise: `forestdist[lld[i']-1][lld[j']-1] + treedist[i'][j']` (jump into a previously computed subtree).
   Store the winning choice as a parent pointer at each cell so we can backtrace.
5. **Backtrace** from `(n1, n2)` using the saved parent pointers, following `jump` edges into the referenced sub-problem, and emit a raw script of `match / rel / del / ins`.
6. **Translate the script** into our operation vocabulary:
   - `match` -> dropped (subtree unchanged).
   - `rel(i, j)` -> `modified` when keys match, `renamed` when only the key differs (identity fingerprints match).
   - Unpaired `del` + `ins` with matching identity fingerprints -> `renamed`.
   - Leftover `del` -> `removed`; leftover `ins` -> `added`.
7. **Ordering analysis** and **verdict** as in fingerprint-flatten.

## Complexity

- Time: **O(n1 * n2 * min(depth1, leaves1) * min(depth2, leaves2))** — quartic in the worst case.
- Space: **O(n1 * n2)** for the treedist matrix plus per-keyroot forestdist / parent matrices (kept for backtrace).

## Trade-offs

- **Pros:** does not require stable keys; produces a mathematically minimal alignment; useful as a correctness oracle for the other algorithms.
- **Cons:** dramatically slower than the keyed algorithms (~80ms vs 1-4ms in the benchmark); needs a virtual root and post-order numbering; backtrace stores parent matrices for every keyroot pair.

## Source

[src/diff/algorithms/tree-edit-distance.js](../src/diff/algorithms/tree-edit-distance.js)
