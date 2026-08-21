'use strict';

const { deepEqual } = require('./value-utils');

const SAFE = 'safe';
const REQUIRES_REVIEW = 'requires-review';
const BREAKING = 'breaking';

const SEVERITY_RANK = { [SAFE]: 0, [REQUIRES_REVIEW]: 1, [BREAKING]: 2 };

/**
 * Fields that only affect presentation. Changing them can never invalidate a
 * stored answer.
 */
const PRESENTATION_FIELDS = new Set([
  'label',
  'description',
  'placeholder',
  'note',
  'information',
  'organizationComment',
  'styleWidthCol',
  'isChecked',
]);

/**
 * Fields whose change alters how an existing stored value is interpreted.
 */
const TYPE_FIELDS = new Set(['dataType', 'specificType', 'parseTextTo']);

/**
 * Default policy. Every entry is overridable so a team can decide, for example,
 * that a move is safe because input_values is keyed by `key` alone.
 */
const DEFAULT_POLICY = {
  inputRemoved: BREAKING,
  inputRenamed: BREAKING,
  inputMoved: REQUIRES_REVIEW,
  inputAdded: SAFE,
  requiredInputAdded: REQUIRES_REVIEW,
  sectionRemoved: BREAKING,
  categoryRemoved: BREAKING,
  sectionAdded: SAFE,
  categoryAdded: SAFE,
  typeChanged: BREAKING,
  becameRequired: BREAKING,
  becameOptional: REQUIRES_REVIEW,
  validationTightened: BREAKING,
  validationRelaxed: REQUIRES_REVIEW,
  enumValueRemoved: REQUIRES_REVIEW,
  enumValueAdded: SAFE,
  presentationChanged: SAFE,
  reordered: SAFE,
  otherFieldChanged: REQUIRES_REVIEW,
};

/**
 * @param {string} left
 * @param {string} right
 * @returns {string} the more severe of two verdicts
 */
function worst(left, right) {
  return SEVERITY_RANK[right] > SEVERITY_RANK[left] ? right : left;
}

/**
 * Decides whether a validations object got stricter or looser.
 *
 * Tightening can invalidate answers that are already stored; relaxing cannot,
 * but is still worth a human glance because it may signal an unintended edit.
 *
 * @param {object} previous
 * @param {object} current
 * @returns {{tightened: string[], relaxed: string[]}}
 */
function compareValidations(previous = {}, current = {}) {
  const tightened = [];
  const relaxed = [];
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);

  for (const key of keys) {
    const before = previous ? previous[key] : undefined;
    const after = current ? current[key] : undefined;
    if (deepEqual(before, after)) continue;

    switch (key) {
      case 'isRequired':
        (after ? tightened : relaxed).push(key);
        break;
      case 'minLength':
        ((after ?? 0) > (before ?? 0) ? tightened : relaxed).push(key);
        break;
      case 'maxLength':
        ((after ?? Infinity) < (before ?? Infinity) ? tightened : relaxed).push(key);
        break;
      case 'pattern':
        (after ? tightened : relaxed).push(key);
        break;
      default:
        (after !== undefined && after !== null ? tightened : relaxed).push(key);
    }
  }

  return { tightened, relaxed };
}

/**
 * Compares two enum lists by value identity rather than array position, so a
 * reordered enum list is not reported as a change.
 *
 * @param {Array} previous
 * @param {Array} current
 * @returns {{removed: Array, added: Array}}
 */
function compareEnumLists(previous = [], current = []) {
  const identity = (entry) =>
    entry && typeof entry === 'object' ? (entry.key ?? entry.value ?? JSON.stringify(entry)) : entry;

  const previousIds = new Set((previous || []).map(identity));
  const currentIds = new Set((current || []).map(identity));

  return {
    removed: [...previousIds].filter((id) => !currentIds.has(id)),
    added: [...currentIds].filter((id) => !previousIds.has(id)),
  };
}

/**
 * Classifies the field-level differences of one matched input.
 *
 * @param {object} previousFields
 * @param {object} currentFields
 * @param {object} policy
 * @returns {Array<{field: string, reason: string, severity: string, detail?: object}>}
 */
function classifyFieldChanges(previousFields, currentFields, policy) {
  const findings = [];
  const keys = new Set([...Object.keys(previousFields || {}), ...Object.keys(currentFields || {})]);

  for (const field of keys) {
    const before = previousFields ? previousFields[field] : undefined;
    const after = currentFields ? currentFields[field] : undefined;
    if (deepEqual(before, after)) continue;

    if (PRESENTATION_FIELDS.has(field)) {
      findings.push({ field, reason: 'presentationChanged', severity: policy.presentationChanged });
      continue;
    }

    if (TYPE_FIELDS.has(field)) {
      findings.push({
        field,
        reason: 'typeChanged',
        severity: policy.typeChanged,
        detail: { from: before ?? null, to: after ?? null },
      });
      continue;
    }

    if (field === 'isRequired') {
      findings.push(
        after
          ? { field, reason: 'becameRequired', severity: policy.becameRequired }
          : { field, reason: 'becameOptional', severity: policy.becameOptional }
      );
      continue;
    }

    if (field === 'validations') {
      const { tightened, relaxed } = compareValidations(before, after);
      if (tightened.length > 0) {
        findings.push({
          field,
          reason: 'validationTightened',
          severity: policy.validationTightened,
          detail: { rules: tightened },
        });
      }
      if (relaxed.length > 0) {
        findings.push({
          field,
          reason: 'validationRelaxed',
          severity: policy.validationRelaxed,
          detail: { rules: relaxed },
        });
      }
      continue;
    }

    if (field === 'enumList') {
      const { removed, added } = compareEnumLists(before, after);
      if (removed.length > 0) {
        findings.push({
          field,
          reason: 'enumValueRemoved',
          severity: policy.enumValueRemoved,
          detail: { values: removed },
        });
      }
      if (added.length > 0) {
        findings.push({
          field,
          reason: 'enumValueAdded',
          severity: policy.enumValueAdded,
          detail: { values: added },
        });
      }
      continue;
    }

    findings.push({ field, reason: 'otherFieldChanged', severity: policy.otherFieldChanged });
  }

  return findings;
}

/**
 * Produces the compatibility verdict from a fingerprint-algorithm change set.
 *
 * @param {Array} changes
 * @param {{reordered: boolean}} ordering
 * @param {object} [policyOverrides]
 * @returns {{verdict: string, reasons: Array, migrations: Array, reviewItems: Array}}
 */
function classify(changes, ordering, policyOverrides) {
  const policy = { ...DEFAULT_POLICY, ...(policyOverrides || {}) };

  let verdict = SAFE;
  const reasons = [];
  const migrations = [];
  const reviewItems = [];

  const record = (severity, entry) => {
    verdict = worst(verdict, severity);
    reasons.push({ ...entry, severity });
    if (severity === REQUIRES_REVIEW) reviewItems.push(entry);
  };

  for (const change of changes) {
    const { operation, scope, path } = change;

    if (operation === 'removed') {
      const severity =
        scope === 'input'
          ? policy.inputRemoved
          : scope === 'section'
            ? policy.sectionRemoved
            : policy.categoryRemoved;
      record(severity, { operation, scope, path });
      if (scope === 'input') {
        migrations.push({ type: 'orphaned-values', scope, path, action: 'archive-or-delete' });
      }
      continue;
    }

    if (operation === 'added') {
      const isRequiredInput = scope === 'input' && change.node && change.node.fields && change.node.fields.isRequired;
      const severity =
        scope === 'input'
          ? isRequiredInput
            ? policy.requiredInputAdded
            : policy.inputAdded
          : scope === 'section'
            ? policy.sectionAdded
            : policy.categoryAdded;
      record(severity, { operation, scope, path, ...(isRequiredInput ? { note: 'required input added' } : {}) });
      continue;
    }

    if (operation === 'renamed' || operation === 'moved+renamed') {
      record(policy.inputRenamed, { operation, scope, from: change.from, to: change.to });
      if (scope === 'input') {
        migrations.push({
          type: 'rename-key',
          scope,
          from: change.from,
          to: change.to,
          action: 'UPDATE input_values SET key = :to WHERE key = :from',
        });
      }
      continue;
    }

    if (operation === 'moved') {
      record(policy.inputMoved, {
        operation,
        scope,
        from: change.from,
        to: change.to,
        note: 'input_values is keyed by key alone, so stored answers survive a move',
      });
      continue;
    }

    if (operation === 'modified') {
      const findings = classifyFieldChanges(
        change.previousFields,
        change.currentFields,
        policy
      );
      for (const finding of findings) {
        record(finding.severity, { operation, scope, path, ...finding });
        if (finding.severity === BREAKING && scope === 'input') {
          migrations.push({ type: finding.reason, scope, path, detail: finding.detail || null });
        }
      }
    }
  }

  if (ordering && ordering.reordered) {
    record(policy.reordered, { operation: 'reordered', scope: 'form', count: ordering.moved.length });
  }

  return { verdict, reasons, migrations, reviewItems };
}

module.exports = {
  classify,
  classifyFieldChanges,
  compareEnumLists,
  compareValidations,
  DEFAULT_POLICY,
  SAFE,
  REQUIRES_REVIEW,
  BREAKING,
};
