'use strict';

const crypto = require('node:crypto');

/**
 * Deterministic JSON serialization: object keys are sorted recursively so that
 * two structurally identical values always produce the same string.
 *
 * Sequelize / JSON.parse do not guarantee key order, so hashing raw
 * JSON.stringify output would report phantom changes on every run.
 *
 * Arrays keep their order - array order is meaningful for enum lists and is
 * handled explicitly by the ordering analysis, not by canonicalization.
 *
 * @param {*} value
 * @returns {string}
 */
function canonicalStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Treats `null` and `undefined` as the same absent value. The Admin template
 * generator emits some optional fields as explicit `null` and omits others
 * entirely, so without this normalization every such field looks changed.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isAbsent(value) {
  return value === null || value === undefined;
}

/**
 * Structural equality. Array order IS significant here; callers that want
 * order-insensitive comparison must sort or strip order first.
 *
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function deepEqual(left, right) {
  if (isAbsent(left) && isAbsent(right)) return true;
  if (isAbsent(left) || isAbsent(right)) return false;
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (typeof left !== 'object') return false;
  return canonicalStringify(left) === canonicalStringify(right);
}

/**
 * Short content fingerprint. Truncated to 16 hex characters (64 bits): with a
 * few thousand nodes per form the collision probability is around 1e-13, and a
 * collision can only ever cause a missed change inside one node, never a
 * corrupted template.
 *
 * @param {*} value
 * @returns {string}
 */
function fingerprint(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex').slice(0, 16);
}

/**
 * Recursively diffs two values, producing one path-addressed entry per leaf
 * difference. Used by recursive-json-diff to descend into nested fields such
 * as `dependOn` or `validations`.
 *
 * @param {*} previousValue
 * @param {*} currentValue
 * @param {string} basePath
 * @param {{onCompare?: function}} [hook]
 * @returns {Array<{type: string, path: string, previousValue: *, currentValue: *}>}
 */
function diffValue(previousValue, currentValue, basePath, hook) {
  const changes = [];

  const walk = (previous, current, path) => {
    if (hook && typeof hook.onCompare === 'function') hook.onCompare();

    if (deepEqual(previous, current)) return;

    const previousIsObject = previous !== null && typeof previous === 'object';
    const currentIsObject = current !== null && typeof current === 'object';

    if (Array.isArray(previous) && Array.isArray(current)) {
      const length = Math.max(previous.length, current.length);
      for (let index = 0; index < length; index += 1) {
        walk(previous[index], current[index], `${path}[${index}]`);
      }
      return;
    }

    if (previousIsObject && currentIsObject && !Array.isArray(previous) && !Array.isArray(current)) {
      const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
      for (const key of keys) {
        walk(previous[key], current[key], path ? `${path}.${key}` : key);
      }
      return;
    }

    let type = 'updated';
    if (isAbsent(previous)) type = 'added';
    else if (isAbsent(current)) type = 'removed';

    changes.push({
      type,
      path,
      previousValue: isAbsent(previous) ? null : previous,
      currentValue: isAbsent(current) ? null : current,
    });
  };

  walk(previousValue, currentValue, basePath || '');
  return changes;
}

module.exports = { canonicalStringify, deepEqual, diffValue, fingerprint, isAbsent };
