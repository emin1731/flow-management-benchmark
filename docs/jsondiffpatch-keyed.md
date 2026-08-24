# jsondiffpatch (keyed)

## Simple description

Off-the-shelf diff via the [`jsondiffpatch`](https://github.com/benjamine/jsondiffpatch) library, wrapped so it fits the shared algorithm contract. Categories, sections, and inputs are converted to arrays and `objectHash` is set to each node's `.key`, which is what turns jsondiffpatch's keyed-array matching on — otherwise a single reorder would report the whole tail as changed.

Use it when you want a mature, battle-tested delta engine and don't need rename-across-key detection. jsondiffpatch matches nodes by `objectHash`, so a changed key is a different object; that means renames look like remove + add. Cross-parent moves also fall back to remove + add because each parent has its own array.

## Steps

1. **Normalize** both templates via `normalizeForm`.
2. **Convert to keyed arrays** so jsondiffpatch matches nodes by `.key` instead of by position. Enum entries fall back to `.value`, everything else falls back to array index (returning `undefined` from `objectHash` breaks matching outright — jsondiffpatch stops treating the array as keyed).
3. **Run `patcher.diff`** with `detectMove: true` to get the delta document.
4. **Walk the delta** recursively:
   - `[value]` -> `added`.
   - `[value, 0, 0]` -> `removed`.
   - `['', newIndex, 3]` -> a position-only move. We **drop it here** and let `analyzeOrdering` be the single source of truth for reorders; otherwise the same physical move would be double-counted in `changes[]` and in `ordering.moved`.
   - Nested delta -> descend into `fields` (emit one `modified` for the node) and into `sections` / `inputs` for children.
5. **Ordering analysis** and **verdict** as in fingerprint-flatten.

## Trade-offs

- **Pros:** external library maturity; produces standard JSON-Patch-ish deltas you can also *apply* or *reverse*; detects position-only moves; small integration code.
- **Cons:** no rename detection (a changed `.key` is a new node); no cross-parent move detection; no content-hash early exit — the whole tree is walked every time. `objectHash` has to return a stable string for every array item or matching silently degrades.

## Source

[src/diff/algorithms/jsondiffpatch-keyed.js](../src/diff/algorithms/jsondiffpatch-keyed.js)
