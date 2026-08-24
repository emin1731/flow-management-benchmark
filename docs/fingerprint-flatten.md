# Fingerprint & Flatten

## Simple description

The most sophisticated of the four algorithms. Each node gets three hashes — a **content**, **identity**, and **subtree** fingerprint — that let the diff (a) exit early when the whole form is unchanged, (b) skip unchanged subtrees whole, and (c) **pair up renames and moves** instead of reporting them as unrelated remove + add. It also runs a separate ordering analysis and produces a compatibility verdict (safe / requires-review / breaking) with the migrations each breaking change implies.

Use it when you need rename/move detection, ordering awareness, and a compatibility verdict — not just a change list.

## The three fingerprints

| Fingerprint | Includes `key`? | Answers |
|-------------|-----------------|---------|
| `content`   | yes             | "Is this exact node unchanged?" |
| `identity`  | **no** (also excludes `path`) | "Is this the same node wearing a different name/place?" |
| `subtree`   | folds children's `content` hashes | "Is this whole subtree unchanged?" |

Excluding `key` from `identity` is what makes rename detection possible: a renamed node has a different `content` hash but the same `identity` hash, so it can be paired with its removal.

## Steps

1. **Normalize** both templates via `normalizeForm`.
2. **Fingerprint + flatten (one pass per side)** via `flattenWithFingerprints`: walk the tree bottom-up, compute the three hashes for each node, and store every node in a `Map<path, node>`. The root also gets a form-level fingerprint (hash of the top-level category subtree hashes).
3. **Whole-form early exit:** if `previous.rootFingerprint === current.rootFingerprint`, nothing structural differs — run ordering analysis and return immediately.
4. **Set diff over the two path maps:**
   - `removed` = paths in `previous` but not in `current`.
   - `added` = paths in `current` but not in `previous`.
   - Same path on both sides:
     - `subtree` hashes match -> skip the whole subtree (`skippedSubtrees++`).
     - `content` hashes differ -> record `modified`.
5. **Pair renames and moves** via `pairRenamesAndMoves`:
   - Bucket every `removed` entry by its `identity` hash.
   - For each `added` entry, look up its `identity` in the buckets.
   - A match becomes a `renamed`, `moved`, or `moved+renamed` pair depending on whether `key` and `parentPath` changed.
   - Matching is **exact** — a node that was renamed *and* edited in the same publish won't pair up and falls back to remove + add. This is the conservative failure: over-report breakage rather than hide it.
   - Ties (more than one candidate per identity) are resolved deterministically by sorted path and logged as `ambiguous`.
6. **Ordering analysis** (`analyzeOrdering`): checks whether sibling categories/sections/inputs were reordered without any structural change.
7. **Verdict** (`classify`): turns the change list + ordering result into `safe` / `requires-review` / `breaking`, along with the migrations each breaking change implies.
8. **Return** `equal = (changes.length === 0 && !ordering.reordered)` plus rich metadata (`hashCount`, `skippedSubtrees`, `renamePairs`, `ambiguousMatches`, `earlyExit`).

## Complexity

- Fingerprint + flatten: **O(N)** in serialized bytes.
- Set diff and rename pairing: **O(n)** in node count.
- Ordering analysis: **O(n log n)**.

## Trade-offs

- **Pros:** detects renames and moves; skips unchanged subtrees; whole-form early exit; separates ordering from structure; produces a compatibility verdict; deterministic tie-breaking.
- **Cons:** more code and more concepts (three hashes, buckets, verdicts); exact identity matching misses "renamed AND edited" cases (by design — conservative).

## Source

[src/diff/algorithms/fingerprint-flatten.js](../src/diff/algorithms/fingerprint-flatten.js)
