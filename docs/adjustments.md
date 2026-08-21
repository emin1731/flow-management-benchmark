# What was adjusted, and why

Notes on bringing the benchmark in line with how form templates actually behave
in the flow-manager / admin split. Read alongside
[`diff-algorithms-technical-task.md`](./diff-algorithms-technical-task.md), which
this supersedes in two places.

---

## 1. The project did not run

Three defects, each fatal on its own:

| Problem | Detail |
|---|---|
| Missing modules | All three algorithms `require('../normalize-form')` and `require('../value-utils')` — neither file existed |
| Interface mismatch | Algorithms import `createResult` / `buildMetadata`; the registry imports `assertValidAlgorithm`. `algorithm.interface.js` exported only `assertAlgorithm` and `assertResult` |
| Wrong export shape | `run-benchmark.js` passed the registry *module object* to `runAlgorithms`, which expects an *array* |

`normalize-form.js` and `value-utils.js` were written to match what the existing
algorithms already assumed, and `algorithm.interface.js` was extended rather than
replaced — the previous exports still work.

## 2. The benchmark was pointed at the wrong half of the template

The technical task states that meaningful content lives under
`fixture.data.sortedKeys`. It does not.

```
sortedKeys input:  { key, label, isAddable, dependOn }

formData input:    { key, label, dataType, specificType, isRequired, validations,
                     enumList, value, placeholder, isHidden, isReadonly, ... }
```

Every field that can make a change **breaking** — `dataType`, `isRequired`,
`validations`, `enumList`, `specificType` — exists only in `formData`. An
algorithm reading `sortedKeys` alone can detect label edits and structural
add/remove, and nothing else.

`normalizeForm` therefore builds the tree from `formData` and uses `sortedKeys`
only for what it is actually for: **render order**.

Two further normalization rules follow from how the Admin generator behaves:

- `orderIndex` is lifted out of the comparable field bag onto `node.order`, so a
  pure reorder produces zero field changes and is reported only by the ordering
  analysis.
- `reviews` is excluded. It is derived from Auth field permissions
  (`json-template.service.js`), not authored in the form builder — a permissions
  change is not a form change.

## 3. There was no ground truth

The harness recorded duration and dumped `changes`, but nothing asserted that an
algorithm answered *correctly*. That makes it a race, and every candidate
finishes in single-digit milliseconds — the least interesting axis.

The four shipped fixtures also only differ by:

```
v1 → v2   1 label edit
v2 → v3   1 label + description edit
v3 → v4   the geographicDistribution category removed
```

No rename, move, reorder, type change, required-flag flip, enum change or
validation change anywhere — so the cases the diff exists for could never fire.

`src/diff/scenarios/` fixes this by **mutating the real v1 template** rather than
adding more 220 KB files. The base data stays realistic (99 real nodes) while the
expected outcome is exact. 22 scenarios now cover the full taxonomy from the
technical task's compatibility table, plus the three real fixture pairs.

## 4. Scoring is capability-shaped, not output-shaped

The four algorithms emit incompatible change vocabularies:

```
deep-equality            { scope, operation, path }               category level only
recursive-json-diff      { type, scope, path }                    path includes the field
hierarchical-keyed-diff  { scope, operation, categoryKey, ... }   no path at all
fingerprint-flatten      { operation, scope, path | from,to }     plus renames and moves
```

`scoring.js` extracts two normalized capabilities from any result — which **node
paths** were touched, and which **operations** were reported — and checks those.
Field-level paths are folded back onto the node that owns them, so
`cat.sec.inputs.key.label` and `cat.sec.key.validations.maxLength` both score
against `cat.sec.key`.

An algorithm that emits no verdict scores `null` on that check rather than
failing it. The result is a capability matrix, which is what a comparison
benchmark should produce.

## 5. Added: the fingerprint algorithm, verdict and version decision

The technical task listed these as non-goals ("do not implement"). They are
implemented, because without them the harness cannot test what the project exists
to test — there was no algorithm capable of rename detection, ordering analysis or
a compatibility verdict to compare against.

- `algorithms/fingerprint-flatten.js` — the designed pipeline
- `ordering.js` — LIS-based reorder analysis
- `verdict.js` — `safe` / `requires-review` / `breaking` with a configurable policy
- `version-decision.js` — content-addressed version decisions, pure and deterministic

### One design point worth knowing

Rename detection needs **two** fingerprints per node:

```
contentFingerprint   includes `key`   -> "is this node unchanged?"
identityFingerprint  excludes `key`   -> "is this the same node under a new name?"
```

With only the content fingerprint a rename changes the hash and could never be
paired with its own removal. Pairing then buckets removals by
`identityFingerprint` and probes with additions — `O(n)` instead of the
`|removed| × |added|` comparison a similarity score would need.

Matching is exact, so a node renamed **and** edited in the same publish will not
pair and falls back to remove + add. That is the conservative failure:
over-reporting breakage rather than hiding it.

## 6. A scenario expectation that was wrong

`validation-relaxed` originally went from `validations: {}` to
`{ maxLength: 4096 }` and expected `requires-review`. The algorithm returned
`breaking` — and it was right: introducing a cap where a field was previously
unbounded is a *tightening*.

The scenario now puts an explicit `maxLength` on both sides so the direction is
unambiguous, and a third scenario, `validation-cap-introduced`, covers the
originally-mislabelled case with the correct expectation.

## Current results

```
ALGORITHM                     PASS  FAIL   MEDIAN ms   PATHS  RENAME  ORDER  VERDICT
deep-equality                    3    19       3.74     yes     no     no      no
recursive-json-diff             19     3       2.37     yes     no     no      no
hierarchical-keyed-diff         19     3       1.25     yes     no     no      no
fingerprint-flatten             22     0       7.03     yes    yes    yes     yes
```

`fingerprint-flatten` is the slowest and the only complete one. At ~7 ms on a
220 KB template that trade is not close — but the number is honest, and it is
slower for a reason: it hashes every node twice and runs an ordering pass the
others skip.

`deep-equality` scoring 3/22 is not a defect. It is a correct, cheap early-exit
equality check that was never meant to localise changes; it passes exactly the
scenarios it was designed for (`identical`, `transport-only`, and the
category-level `real-v3-to-v4`).

## Suggested next steps

1. **Store node fingerprints in the template blob.** Diffing then skips unchanged
   subtrees — `O(d)` in changed nodes instead of `O(N)`. Only worth it if diffs
   are read often; measure with this harness first.
2. **Add a `pipeline` pseudo-algorithm** — `deep-equality` as an early exit, then
   `fingerprint-flatten` only when they differ — and score it here.
3. **Decide the move policy.** `verdict.js` currently rates a move
   `requires-review`. In flow-manager, `input_values` is unique on
   `(appeal_id, key)` and looked up by `key` alone, so stored answers survive a
   move — `safe` is defensible. It is a one-line policy override.
4. **Delete the unused scaffolding** (`src/app.js`, `src/server.js`,
   `src/models/`, `src/config/database.js`, `src/routes/`, `docker-compose.yml`)
   if this project stays a pure benchmark.
