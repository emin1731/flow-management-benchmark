'use strict';

const { getAlgorithm } = require('./algorithms');

/**
 * Decides whether an incoming form warrants a new version.
 *
 * This is the piece that replaces manual version entry. The rule is
 * content-addressed: a version exists because the content differs, not because
 * somebody typed a number.
 *
 * Deliberately pure - it reads nothing, writes nothing, and mutates neither
 * input. Persistence is the caller's job, inside its own transaction.
 *
 * @param {object} input
 * @param {number} input.currentVersion
 * @param {object} input.storedForm the currently active template
 * @param {object} input.incomingForm the template just generated from the editor
 * @param {string} [input.algorithmName]
 * @param {boolean} [input.ignoreOrdering] treat pure reorders as non-material
 * @returns {object} decision
 */
function decideVersion({
  currentVersion,
  storedForm,
  incomingForm,
  algorithmName = 'fingerprint-flatten',
  ignoreOrdering = false,
}) {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new RangeError('currentVersion must be an integer >= 1.');
  }
  if (!storedForm || !incomingForm) {
    throw new TypeError('decideVersion requires both storedForm and incomingForm.');
  }

  const algorithm = getAlgorithm(algorithmName);
  const result = algorithm.compare(storedForm, incomingForm);

  const reorderedOnly =
    result.changes.length === 0 && Boolean(result.ordering && result.ordering.reordered);

  const isEqual = ignoreOrdering ? result.changes.length === 0 : result.equal;
  const shouldCreateVersion = !isEqual;

  const verdict = result.verdict || { verdict: 'requires-review', reasons: [], migrations: [], reviewItems: [] };

  return {
    isEqual,
    shouldCreateVersion,
    currentVersion,
    nextVersion: shouldCreateVersion ? currentVersion + 1 : currentVersion,
    compatibilityVerdict: shouldCreateVersion ? verdict.verdict : 'safe',
    reorderedOnly,
    changes: result.changes,
    ordering: result.ordering || { reordered: false, moved: [] },
    requiredMigrations: shouldCreateVersion ? verdict.migrations : [],
    reviewItems: shouldCreateVersion ? verdict.reviewItems : [],
    algorithm: algorithmName,
  };
}

/**
 * Guards against two editors publishing from the same base version.
 *
 * The caller re-reads the active version inside its write transaction and
 * compares it with the version the decision was computed against; a mismatch
 * means the decision is stale and must be recomputed.
 *
 * @param {number} decidedFromVersion
 * @param {number} versionAtWriteTime
 * @returns {{stale: boolean, reason?: string}}
 */
function checkConcurrency(decidedFromVersion, versionAtWriteTime) {
  if (decidedFromVersion !== versionAtWriteTime) {
    return {
      stale: true,
      reason:
        `Decision was computed against version ${decidedFromVersion} but the active version ` +
        `is now ${versionAtWriteTime}. Recompute before persisting.`,
    };
  }
  return { stale: false };
}

module.exports = { checkConcurrency, decideVersion };
