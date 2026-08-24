# Recursive JSON Diff

## Simple description

Walks the canonical Form -> Category -> Section -> Input tree and, inside each node, **recurses into every field including nested objects and arrays** (e.g. into individual `dependOn` entries) using a generic object/array walker. Every leaf-level difference becomes its own path-addressed change entry.

Use it when you want the most fine-grained output — one change per leaf, with a fully qualified dotted path.

## Steps

1. **Normalize** both templates via `normalizeForm`.
2. **Walk the hierarchy** in three nested loops: categories -> sections -> inputs, taking the union of keys at each level.
3. **For each node key:**
   - Missing on one side -> emit a single structural `added` / `removed` change carrying the whole node.
   - Present on both -> call `diffValue(previousFields, currentFields, node.path, countingHook)` from [value-utils](../src/diff/value-utils.js). This helper recurses through objects and arrays and yields one change per differing leaf, each with a fully qualified path like `serviceInformation.serviceNameAndDescription.inputs.serviceId.label`.
4. **Return** `equal = (changes.length === 0)` plus metadata.

## Example output

```json
{
  "type": "updated",
  "scope": "input",
  "path": "serviceInformation.serviceNameAndDescription.inputs.serviceId.label",
  "previousValue": "Old label",
  "currentValue": "New label"
}
```

## Trade-offs

- **Pros:** maximum granularity; a single dotted `path` per change is trivial to render, log, or feed into a patcher; sees inside nested arrays/objects.
- **Cons:** very chatty on nodes with many field edits (N changes instead of 1); no rename/move detection; no ordering analysis; no compatibility verdict.

## Source

[src/diff/algorithms/recursive-json-diff.js](../src/diff/algorithms/recursive-json-diff.js)
