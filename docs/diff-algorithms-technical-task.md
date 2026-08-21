# Technical Task: Analyze Existing Form Diff Algorithms and Design Improvements

## Objective

Analyze the diff algorithms already present in this repository, explain how they work, compare their tradeoffs, and design the next fingerprint-based algorithm for later implementation.

The immediate deliverable is algorithm analysis and design, not production code. Do not rewrite the existing algorithms or implement new JavaScript files yet.

The final design will later be used to decide whether an incoming form should create a new version and whether publishing that version is safe or breaking.

## Business Context

The system has two conceptual spaces:

1. The form editor allows users to make many changes without changing the form version.
2. The flow manager receives the edited form, compares it with the currently tracked version, decides whether a new version is required, and reports changed categories, sections, and inputs.

The diff system must distinguish real additions and removals, field modifications, renames, moves, reordering, harmless presentation changes, and breaking changes that can invalidate existing data or appeals.

## Existing Algorithms

The repository currently contains these registered algorithms under `src/diff/algorithms/`:

```text
deep-equality
recursive-json-diff
hierarchical-keyed-diff
```

The registry is in `src/diff/algorithms/index.js`.

Analyze the actual current source files before writing conclusions:

```text
src/diff/algorithms/deep-equality.js
src/diff/algorithms/recursive-json-diff.js
src/diff/algorithms/hierarchical-keyed-diff.js
src/diff/algorithm.interface.js
src/diff/runner.js
src/diff/report.js
src/diff/fixture-loader.js
```

Do not assume that the existing implementation matches an earlier specification. Describe what it actually does.

### Existing Algorithm 1: Deep Equality

Explain:

- What normalization it currently performs.
- Whether array order affects equality.
- What fields are compared.
- What changes it reports when forms differ.
- Whether it reports category, section, or input detail.
- Its likely runtime and memory complexity.
- Its strengths and limitations as an early-exit equality check.

### Existing Algorithm 2: Recursive JSON Diff

Explain:

- How it walks categories, sections, and inputs.
- How it recursively compares fields and nested values.
- How it reports paths.
- How it handles additions and removals.
- Whether it detects renames or moves.
- Whether it distinguishes array reordering from content changes.
- Its likely runtime and memory complexity.
- Its strengths and limitations for detailed user-facing reports.

### Existing Algorithm 3: Hierarchical Keyed Diff

Explain:

- How it matches categories, sections, and inputs by keys.
- How it batches field changes into a `fields` array.
- How it reports added, removed, and updated nodes.
- How it handles nested objects and arrays inside fields.
- Whether it detects renames or moves.
- Whether it reports order changes.
- Its likely runtime and memory complexity.
- Its strengths and limitations for business-level change reporting.

## Current Data Shape

The sample snapshots are:

```text
form-template-v1.json
form-template-v2.json
form-template-v3.json
form-template-v4.json
```

Meaningful content is under `fixture.data.sortedKeys`.

The hierarchy is:

```text
Form
  -> Category
    -> Section
      -> Input
        -> Enum values, where present
```

Typical identities are:

```text
Category: category.key
Section:  category.key + section.key
Input:    category.key + section.key + input.key
```

Transport fields such as `timestamp`, `transaction`, `status`, and `description` must not affect semantic equality.

## Primary New Algorithm: Fingerprint and Flatten

Design a new algorithm based on the following mechanism. It should complement the existing algorithms rather than replace them conceptually.

### Step 0: Fingerprint Every Node

Walk the form tree and calculate a deterministic short fingerprint for every category, section, input, and enum value.

The fingerprint should include the node's meaningful fields, child fingerprints for parent nodes, and canonically serialized values.

Explain:

- Which fields are included or excluded.
- Whether separate content and order fingerprints are needed.
- How nested objects and arrays are canonicalized.
- How transport metadata is excluded.
- What hash function is appropriate.
- Collision risks and mitigation.
- How matching parent fingerprints allows unchanged subtrees to be skipped.

### Step 1: Flatten the Tree

Convert both versions into lookup maps addressed by stable paths.

Example:

```text
v6: stats.usage.totalCount   -> { scope: input, key: totalCount, fingerprint: a1b2... }
    stats.usage.uniqueUsers  -> { scope: input, key: uniqueUsers, fingerprint: c3d4... }
    stats.payments.feeAmount -> { scope: input, key: feeAmount, fingerprint: e5f6... }

v7: stats.usage.requestCount -> { scope: input, key: requestCount, fingerprint: a1b2... }
    stats.usage.uniqueUsers  -> { scope: input, key: uniqueUsers, fingerprint: 9z8y... }
    stats.usage.feeAmount    -> { scope: input, key: feeAmount, fingerprint: e5f6... }
    stats.usage.avgDuration  -> { scope: input, key: avgDuration, fingerprint: 7k6j... }
```

Define the exact path format, flattened node record, duplicate-key behavior, parent and leaf inclusion, and path behavior when a parent moves or is renamed.

### Step 2: Compare the Maps

Use three sets:

- Present only in the incoming version: additions.
- Present only in the current version: removals.
- Present in both versions with different fingerprints: modifications.

Explain why stable-key lookup is preferable to comparing array indexes.

### Step 3: Pair Removals with Additions

Design rename and move detection using fingerprints.

Requirements:

- Group removed nodes by fingerprint.
- Match additions with removed nodes having the same fingerprint.
- Distinguish rename, move, move plus rename, true removal, and true addition.
- Define deterministic tie-breaking when multiple nodes share a fingerprint.
- Explain why a fingerprint alone can produce ambiguous matches.
- Recommend additional identity or similarity checks.
- Explain whether child changes caused by a parent move should be collapsed into one move.

Use an example equivalent to:

```text
renamed:  totalCount -> requestCount
moved:    payments.feeAmount -> usage.feeAmount
added:    avgDuration
modified: uniqueUsers
removed:  none
```

Explain why rename, move, and removal need different business responses.

### Step 4: Analyze Ordering Separately

Ordering must not be confused with additions, removals, or field modifications.

Design an ordering comparison that:

- Compares category, section, and input order independently.
- Can ignore order for semantic equality when required.
- Still reports user-visible reorder operations.
- Does not report every item as moved when one item is inserted at the beginning.
- Uses longest-increasing-subsequence or an equivalent strategy where appropriate.
- Documents complexity and tradeoffs.

### Step 5: Produce a Compatibility Verdict

Design a final verdict based on all detected changes:

```text
safe
breaking
requires-review
```

Evaluate these initial rules and state which should be configurable:

| Change                           | Initial classification                                 |
| -------------------------------- | ------------------------------------------------------ |
| Input removed                    | Breaking                                               |
| Input renamed                    | Breaking                                               |
| Input moved                      | Safe or requires-review, depending on lookup semantics |
| Input data type changed          | Breaking                                               |
| Optional input became required   | Breaking                                               |
| Required input became optional   | Safe or requires-review                                |
| Input added                      | Safe                                                   |
| Label changed                    | Safe                                                   |
| Description changed              | Safe                                                   |
| Category/section/input reordered | Safe                                                   |
| Enum value removed               | Breaking or requires-review                            |
| Enum value added                 | Usually safe                                           |
| Validation tightened             | Breaking                                               |
| Validation relaxed               | Safe or requires-review                                |

The verdict must answer:

```text
Is the incoming form materially different?
Should a new version be created?
Is publishing the new version breaking?
What must be migrated?
What requires human review?
```

## Version Update Design

Design version decision logic independently from the diff implementation.

Input:

```text
currentVersion
storedForm
incomingForm
selectedDiffAlgorithm
```

Output:

```text
isEqual
shouldCreateVersion
currentVersion
nextVersion
compatibilityVerdict
changes
requiredMigrations
reviewItems
```

Define rules for equal forms preserving the current version, materially different forms incrementing the version by one, versions below `1` being invalid, transport-only changes not creating versions, deterministic decisions, no input mutation, one active version per form key, deciding before persistence, transactional persistence later, and concurrent submissions based on the same current version.

## Compare Existing and Proposed Approaches

Create a comparison table covering:

```text
deep-equality
recursive-json-diff
hierarchical-keyed-diff
fingerprint-and-flatten
```

Compare equality correctness, detail of change reporting, additions/removals, rename detection, move detection, ordering support, breaking-change detection, explainability, early-exit capability, runtime complexity, memory complexity, implementation complexity, and suitability for large forms.

Recommend which algorithm or pipeline should be used for fast equality checks, detailed reports, rename and move detection, breaking-change detection, and large forms.

## Required Deliverable

Return a technical design document, not production implementation code. It must contain:

1. An accurate analysis of the three existing algorithm files.
2. A precise step-by-step design for fingerprinting and flattening.
3. Pseudocode for the fingerprint-based algorithm.
4. Pseudocode for rename, move, and ambiguity resolution.
5. Pseudocode for ordering analysis.
6. Pseudocode for compatibility and version decisions.
7. Canonicalization and stable identity rules.
8. Complexity analysis using `n` for nodes and `d` for changes.
9. Collision, duplicate-key, malformed-input, and ambiguous-match handling.
10. A worked example using the form hierarchy.
11. A comparison table of all four approaches.
12. A later implementation test matrix.
13. A recommended algorithm or multi-stage pipeline.

## Non-Goals

Do not:

- Rewrite the existing algorithms.
- Add new JavaScript implementation files.
- Modify Sequelize models.
- Add Express endpoints.
- Add database migrations.
- Implement persistence.
- Claim performance results without executable benchmark runs.

The design should be detailed enough that another developer can implement the proposed fingerprint-based algorithm and compare it fairly with the three existing algorithms later.
