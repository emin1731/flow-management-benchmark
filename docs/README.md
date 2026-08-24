# Diff algorithms

Seven algorithms live in [src/diff/algorithms/](../src/diff/algorithms/). They all answer *"did anything change?"* the same way (`equal: true/false`), but the **granularity and shape of `changes[]` differs** — they are not drop-in replacements.

## Output comparison

| Algorithm | Which category? | Which section? | Which input? | Which field? | Nested field paths (e.g. inside `dependOn`)? | Renames / moves? | Ordering? | Verdict? |
|---|---|---|---|---|---|---|---|---|
| [deep-equality](./deep-equality.md) | yes | no | no | no | no | no | no | no |
| [hierarchical-keyed-diff](./hierarchical-keyed-diff.md) | yes | yes | yes | yes (batched per node) | no (opaque value) | no | no | no |
| [recursive-json-diff](./recursive-json-diff.md) | yes | yes | yes | yes (one entry per field) | yes | no | no | no |
| [fingerprint-flatten](./fingerprint-flatten.md) | yes | yes | yes | node-level (`modified` with before/after field bags) | no | **yes (cross-tree)** | yes | yes |
| [recursive-merkle-diff](./recursive-merkle-diff.md) | yes | yes | yes | node-level (`modified` with before/after field bags) | no | yes (**same parent only**) | yes | yes |
| [jsondiffpatch-keyed](./jsondiffpatch-keyed.md) | yes | yes | yes | node-level (`modified` with before/after field bags) | no | position moves only (no rename) | yes | yes |
| [tree-edit-distance](./tree-edit-distance.md) | yes | yes | yes | node-level (`modified` with before/after field bags) | no | yes (inferred from edit script) | yes | yes |

## Key differences

- **deep-equality** only tells you *which top-level categories* changed. It hands back the entire before/after subtree and stops there.
- **hierarchical-keyed-diff** and **recursive-json-diff** both drill down to the input level, but shape their output differently: hierarchical batches all changed fields on a node into one entry (`fields: [...]`), recursive emits one entry per changed leaf with a dotted path — and only recursive sees inside nested objects/arrays like `dependOn`.
- **fingerprint-flatten** reports node-level `modified` entries, and is the reference implementation for **renames, moves, ordering changes, and a compatibility verdict**. Global rename bucket catches cross-parent moves.
- **recursive-merkle-diff** is the same idea as fingerprint-flatten but with a recursive walk instead of a flat map — cheaper allocation, but rename detection is per-parent only, so cross-parent moves become remove + add.
- **jsondiffpatch-keyed** is an off-the-shelf library wrapped to fit the shared contract. Detects position moves cheaply, but a key change is a new node (no rename detection). Useful when you also want to *apply* / *reverse* the delta.
- **tree-edit-distance (Zhang-Shasha)** infers alignment from the minimum edit script, so it works even without stable keys. Orders of magnitude slower — best used as a correctness oracle for the keyed algorithms.

## Benchmark snapshot

From `npm run benchmark` on the current fixtures (22 scenarios):

| Algorithm | Pass | Median ms | Notes |
|---|---|---|---|
| deep-equality | 3 / 22 | ~2 | Category-level only. |
| recursive-json-diff | 19 / 22 | ~1.4 | No renames / ordering / verdict. |
| hierarchical-keyed-diff | 19 / 22 | ~0.8 | No renames / ordering / verdict. |
| fingerprint-flatten | **22 / 22** | ~3.8 | Reference implementation. |
| recursive-merkle-diff | 21 / 22 | ~3.5 | Misses cross-parent moves (by design). |
| jsondiffpatch-keyed | 20 / 22 | ~1.1 | Misses renames and cross-parent moves (by design). |
| tree-edit-distance | 20 / 22 | ~80 | Verdict differs on reorder / move edge cases; slowest by ~20x. |

Downstream consumers (UIs, migration generators, changelogs) should pick based on the output shape they need — and on whether they can afford a heavier algorithm for the completeness dividend.
