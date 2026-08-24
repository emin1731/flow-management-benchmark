# Deep Equality

## Simple description

The cheapest possible diff. It normalizes both form templates and runs a single structural equality check at the category level. If two categories are not equal, it reports the whole category as "updated" without descending into which section, input, or field actually changed.

Use it when you only need a yes/no answer with a category-level pointer to where the change lives.

## Steps

1. **Normalize** both `previous` and `current` templates into the canonical Form -> Category -> Section -> Input shape via [normalizeForm](../src/diff/normalize-form.js).
2. **Union** the category keys from both sides.
3. **For each category key:**
   - If only in `current` -> record `{ scope: 'category', operation: 'added' }`.
   - If only in `previous` -> record `{ scope: 'category', operation: 'removed' }`.
   - If in both -> `stripOrder` on each subtree (the positional `order` field is not a material change), then `deepEqual` the two. If unequal, record `{ scope: 'category', operation: 'updated' }` with the full before/after subtrees.
4. **Return** `equal = (changes.length === 0)` plus metadata (duration, comparison count, normalized node count).

## Trade-offs

- **Pros:** minimal work, one comparison per category, easy to reason about.
- **Cons:** no per-section, per-input, or per-field detail; a single typo in one label reports the whole category as changed. No rename/move detection, no ordering analysis, no compatibility verdict.

## Source

[src/diff/algorithms/deep-equality.js](../src/diff/algorithms/deep-equality.js)
