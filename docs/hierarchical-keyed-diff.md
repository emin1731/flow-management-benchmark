# Hierarchical Keyed Diff

## Simple description

A form-aware diff that walks the explicit Form -> Category -> Section -> Input hierarchy. Instead of returning one change per differing leaf field (like [recursive-json-diff](./recursive-json-diff.md)), it **batches every field difference inside a single node into one change entry** with a `fields: [...]` array. Nested objects/arrays (e.g. `dependOn`) are treated as one opaque field value.

Use it when you want one change record per node ("this input was updated, and here are the fields that moved") rather than a flat list of leaf-level diffs.

## Steps

1. **Normalize** both templates via `normalizeForm`.
2. **Walk the hierarchy** in three nested loops: categories -> sections -> inputs. At each level, take the union of keys from both sides.
3. **For each node key at each level:**
   - Missing on one side -> emit `added` or `removed` with a single `{ field: '*', ... }` entry that carries the whole node payload.
   - Present on both -> run `fieldDiff(previousFields, currentFields)`:
     - Union all field names.
     - `deepEqual` each pair.
     - Collect `{ field, previousValue, currentValue }` for each mismatch.
   - If any field mismatches, emit one `updated` change with the collected `fields[]`.
4. **Return** `equal = (changes.length === 0)` plus metadata.

## Trade-offs

- **Pros:** natural output shape for UIs ("changes grouped by node"), knows the form hierarchy, still simple.
- **Cons:** treats nested fields as opaque (won't tell you which array index of `dependOn` changed); no rename/move detection; no ordering analysis; no compatibility verdict.

## Source

[src/diff/algorithms/hierarchical-keyed-diff.js](../src/diff/algorithms/hierarchical-keyed-diff.js)
