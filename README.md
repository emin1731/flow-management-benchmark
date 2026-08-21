# Flow Management Benchmark

A harness for comparing **form-template diff and versioning algorithms**.

Given two snapshots of a form template, an algorithm must decide whether they are
materially different, say what changed, and — ideally — say whether publishing the
change is safe. This project runs every candidate algorithm against a set of
ground-truth scenarios and scores them on **correctness first, speed second**.

## Quick start

```bash
npm install
npm run benchmark          # human-readable scorecard, all algorithms
npm run benchmark:json     # machine-readable report
npm run benchmark:strict   # CI gate: fingerprint-flatten must pass every scenario
npm test                   # unit tests

# compare one algorithm only
node src/diff/run-benchmark.js --only=hierarchical-keyed-diff
```

`--strict` exits non-zero when any scenario fails, so pair it with `--only=<name>`
to gate the algorithm you are developing. Without `--only` it will always fail,
because the baseline algorithms are *expected* to miss the scenarios they were
never designed for.

No database or server is needed for the benchmark — it is pure computation over
JSON fixtures.

## What is being compared

Four algorithms are registered in `src/diff/algorithms/index.js`:

| Algorithm | Approach |
|---|---|
| `deep-equality` | normalize both sides, one structural equality check, category-level reporting |
| `recursive-json-diff` | recursive walk producing one path-addressed entry per changed leaf field |
| `hierarchical-keyed-diff` | walks Form → Category → Section → Input, batching field changes per node |
| `fingerprint-flatten` | Merkle fingerprints → flatten to paths → set diff → rename/move pairing → LIS ordering → compatibility verdict |

## The data

Fixtures `form-template-v1.json` … `v4.json` are **real Admin API responses**
(`GET /api/v1/form-template/:formKey`). The shape is:

```
{ app_name, timestamp, transaction, status, description, data: { roleStructure, sortedKeys, formData } }
```

Two things matter about that payload:

- **`formData` is the meaningful half.** It carries `dataType`, `isRequired`,
  `validations`, `enumList`, `specificType` — every field that can make a change
  breaking. `sortedKeys` carries only `key`, `label`, `isAddable`, `dependOn`, and
  exists to record render **order**.
- **Transport fields must never affect equality.** `timestamp` and `transaction`
  change on every request.

`src/diff/normalize-form.js` handles both: it builds the tree from `formData`,
takes order from `sortedKeys`, drops transport fields, and lifts `orderIndex` out
of the comparable field bag so a pure reorder produces no field changes.

Each fixture normalizes to **99 nodes** (5 categories, 32 sections, 62 inputs)
at roughly 220 KB of JSON.

## Ground truth

The four shipped fixtures only differ by two label edits and one removed category,
so on their own they cannot exercise rename, move, reorder, type change,
required-flag flips, enum changes or validation changes.

Rather than hand-maintaining a dozen more 220 KB files, `src/diff/scenarios/`
derives each scenario by **mutating the real v1 template** — realistic data, exact
expected outcome. The three real adjacent fixture pairs are included too.

| Group | Scenarios |
|---|---|
| equality | `identical`, `transport-only` |
| presentation | `label-edited`, `section-description-edited` |
| ordering | `input-reordered` |
| structure | `input-added-optional`, `input-added-required`, `input-removed`, `section-removed` |
| identity | `input-renamed`, `input-moved` |
| compatibility | `datatype-changed`, `optional-became-required`, `required-became-optional`, `validation-tightened`, `validation-relaxed`, `validation-cap-introduced`, `enum-value-added`, `enum-value-removed` |
| real | `real-v1-to-v2`, `real-v2-to-v3`, `real-v3-to-v4` |

## How scoring works

The four algorithms emit different change vocabularies, so the scorer cannot
compare raw output. `src/diff/scoring.js` extracts two normalized capabilities
from any result — which **node paths** were touched and which **operations** were
reported — and checks those against the scenario's expectation:

| Check | Question |
|---|---|
| `equality` | did it get "are these the same form?" right |
| `touched-nodes` | did it point at the nodes that actually changed |
| `verdict` | did it classify severity correctly (skipped if the algorithm emits none) |
| `rename-move-pairing` | did it recognise a rename/move rather than remove + add |
| `reorder-detection` | did it notice a pure reorder |

Timing is the **median of 5 runs** (`BENCHMARK_REPEATS` to change it); a single run
on a 220 KB template measures JIT warm-up, not the algorithm.

## Current results

```
ALGORITHM                     PASS  FAIL   MEDIAN ms   PATHS  RENAME  ORDER  VERDICT
deep-equality                    3    19       3.74     yes     no     no      no
recursive-json-diff             19     3       2.37     yes     no     no      no
hierarchical-keyed-diff         19     3       1.25     yes     no     no      no
fingerprint-flatten             22     0       7.03     yes    yes    yes     yes
```

Read this as a **capability** table, not a race. Every algorithm finishes in
single-digit milliseconds, so speed is not the deciding factor. What separates
them is that only `fingerprint-flatten` can tell a rename from a delete, notice a
reorder, or say whether publishing is safe.

`deep-equality` is not "bad" — it is a correct, cheap early-exit equality check
that was never meant to localise changes. Its low score reflects scenarios it was
not designed for.

## Adding an algorithm

```js
// src/diff/algorithms/my-algorithm.js
const { normalizeForm } = require('../normalize-form');
const { buildMetadata, createResult } = require('../algorithm.interface');

function compare(previous, current) {
  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);
  // ...
  return createResult({
    equal,
    changes,          // required
    ordering,         // optional: { reordered, moved[] }
    verdict,          // optional: { verdict, reasons[], migrations[], reviewItems[] }
    metadata: buildMetadata({ algorithm: 'my-algorithm', durationMs, comparisonCount }),
  });
}

module.exports = { name: 'my-algorithm', compare };
```

Register it in `src/diff/algorithms/index.js`. Emitting `ordering` and `verdict` is
optional — algorithms that skip them simply score `null` on those checks rather
than failing.

## Versioning

`src/diff/version-decision.js` is the content-addressed replacement for manually
typed version numbers. It is **pure**: it reads nothing, writes nothing, mutates
neither input, and leaves persistence to the caller.

```js
decideVersion({ currentVersion, storedForm, incomingForm, algorithmName })
// -> { isEqual, shouldCreateVersion, currentVersion, nextVersion,
//      compatibilityVerdict, changes, ordering, requiredMigrations, reviewItems }
```

Rules: equal forms keep the current version; material differences increment by
exactly one; a version below 1 is invalid; transport-only changes never create a
version. `checkConcurrency(decidedFrom, versionAtWriteTime)` flags a decision that
went stale because another publish landed first.

## Layout

```
src/diff/
├── normalize-form.js      formData + sortedKeys -> canonical comparable tree
├── value-utils.js         canonical stringify, deepEqual, fingerprint, diffValue
├── ordering.js            LIS-based reorder analysis
├── verdict.js             safe | requires-review | breaking, plus migrations
├── version-decision.js    should a new version be created, and what is next
├── scoring.js             normalizes any algorithm output into capabilities
├── fixture-loader.js      discovers form-template-v*.json
├── runner.js              single-run execution against the shared contract
├── report.js              report building and console rendering
├── run-benchmark.js       entry point
├── scenarios/             ground truth: mutations.js + index.js
└── algorithms/            the four implementations
```

## Note on the Express and Sequelize scaffolding

`src/app.js`, `src/server.js`, `src/models/`, `src/config/database.js`,
`src/routes/` and `docker-compose.yml` are unused by the benchmark. They are
left in place, but nothing in the diff pipeline touches a database or an HTTP
server — the harness is pure computation over JSON. Remove them if this project
stays a benchmark.
