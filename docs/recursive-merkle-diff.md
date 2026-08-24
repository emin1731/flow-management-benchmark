# Recursive Merkle Diff

## Simple description

Uses the same three fingerprints as [fingerprint-flatten](./fingerprint-flatten.md) (`content`, `identity`, `subtree`) but **walks the two trees in parallel** instead of flattening them into a `Map` first. At every node, subtree hashes are compared: if they match, the whole subtree is skipped without touching a single field.

Rename detection is scoped to **the same parent** — an input renamed inside its section is caught, but an input moved from one section to another shows up as remove + add. That is the honest trade-off for the smaller intermediate structure: no global flat map, so no global rename bucket.

Use it when you want fingerprint-flatten's early-exit and verdict pipeline but don't need cross-parent move detection, and prefer a recursive walk to a `Map`-based set diff.

## Steps

1. **Normalize** both templates via `normalizeForm`.
2. **Annotate** each side bottom-up: compute `content` / `identity` / `subtree` hashes for every node and stash them on the node (no separate flat map).
3. **Whole-form early exit:** if root fingerprints match, run ordering analysis and return.
4. **Diff children at each level** via `diffChildren(scope, previousChildren, currentChildren)`:
   - Bucket keys into `removed`, `added`, `bothSides`.
   - Pair removals with additions in this sibling group by `identity` hash -> `renamed` for matches (deterministic on ambiguous ties).
   - For each key present on both sides:
     - `subtree` hashes equal -> skip whole subtree.
     - `content` hashes differ -> emit `modified` with before/after field bags, then descend.
5. **Ordering analysis** and **verdict** as in fingerprint-flatten.

## Trade-offs

- **Pros:** less code than fingerprint-flatten; no intermediate `Map`; recursive shape mirrors the form hierarchy; same early-exit and subtree-skipping wins.
- **Cons:** rename/move detection is per-parent only; a node genuinely moved to a different section falls back to remove + add. Cross-tree ambiguity that fingerprint-flatten catches with its global bucket is invisible here.

## Source

[src/diff/algorithms/recursive-merkle-diff.js](../src/diff/algorithms/recursive-merkle-diff.js)
