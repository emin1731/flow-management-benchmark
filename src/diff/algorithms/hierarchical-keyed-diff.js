'use strict';

const { normalizeForm } = require('../normalize-form');
const { deepEqual } = require('../value-utils');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'hierarchical-keyed-diff';

/**
 * Form-aware diff that walks the explicit Form -> Category -> Section -> Input
 * hierarchy. Unlike recursive-json-diff, field differences within a single
 * node (category/section/input) are batched into one change entry with a
 * `fields` array, e.g.:
 *
 *   {
 *     scope: 'input',
 *     operation: 'updated',
 *     categoryKey: 'serviceInformation',
 *     sectionKey: 'serviceNameAndDescription',
 *     inputKey: 'serviceId',
 *     fields: [
 *       { field: 'label', previousValue: 'Old label', currentValue: 'New label' }
 *     ]
 *   }
 *
 * Nested objects/arrays inside a field (e.g. `dependOn`) are treated as a
 * single opaque field value rather than being recursed into individually -
 * that fine-grained detail is what recursive-json-diff is for.
 *
 * @param {*} previous
 * @param {*} current
 * @returns {import('../algorithm.interface').Result}
 */
function compare(previous, current) {
  const start = process.hrtime.bigint();

  const normalizedPrevious = normalizeForm(previous);
  const normalizedCurrent = normalizeForm(current);

  let comparisonCount = 0;
  const changes = [];

  const fieldDiff = (previousFields, currentFields) => {
    const fields = [];
    const keys = new Set([...Object.keys(previousFields || {}), ...Object.keys(currentFields || {})]);
    for (const field of keys) {
      comparisonCount += 1;
      const previousValue = previousFields ? previousFields[field] : undefined;
      const currentValue = currentFields ? currentFields[field] : undefined;
      if (!deepEqual(previousValue, currentValue)) {
        fields.push({ field, previousValue: previousValue === undefined ? null : previousValue, currentValue: currentValue === undefined ? null : currentValue });
      }
    }
    return fields;
  };

  const categoryKeys = new Set([
    ...Object.keys(normalizedPrevious.categories),
    ...Object.keys(normalizedCurrent.categories),
  ]);

  for (const categoryKey of categoryKeys) {
    comparisonCount += 1;
    const previousCategory = normalizedPrevious.categories[categoryKey];
    const currentCategory = normalizedCurrent.categories[categoryKey];

    if (!previousCategory) {
      changes.push({
        scope: 'category',
        operation: 'added',
        categoryKey,
        fields: [{ field: '*', previousValue: null, currentValue: currentCategory }],
      });
      continue;
    }
    if (!currentCategory) {
      changes.push({
        scope: 'category',
        operation: 'removed',
        categoryKey,
        fields: [{ field: '*', previousValue: previousCategory, currentValue: null }],
      });
      continue;
    }

    const categoryFieldChanges = fieldDiff(previousCategory.fields, currentCategory.fields);
    if (categoryFieldChanges.length > 0) {
      changes.push({
        scope: 'category',
        operation: 'updated',
        categoryKey,
        fields: categoryFieldChanges,
      });
    }

    const sectionKeys = new Set([
      ...Object.keys(previousCategory.sections),
      ...Object.keys(currentCategory.sections),
    ]);

    for (const sectionKey of sectionKeys) {
      comparisonCount += 1;
      const previousSection = previousCategory.sections[sectionKey];
      const currentSection = currentCategory.sections[sectionKey];

      if (!previousSection) {
        changes.push({
          scope: 'section',
          operation: 'added',
          categoryKey,
          sectionKey,
          fields: [{ field: '*', previousValue: null, currentValue: currentSection }],
        });
        continue;
      }
      if (!currentSection) {
        changes.push({
          scope: 'section',
          operation: 'removed',
          categoryKey,
          sectionKey,
          fields: [{ field: '*', previousValue: previousSection, currentValue: null }],
        });
        continue;
      }

      const sectionFieldChanges = fieldDiff(previousSection.fields, currentSection.fields);
      if (sectionFieldChanges.length > 0) {
        changes.push({
          scope: 'section',
          operation: 'updated',
          categoryKey,
          sectionKey,
          fields: sectionFieldChanges,
        });
      }

      const inputKeys = new Set([
        ...Object.keys(previousSection.inputs),
        ...Object.keys(currentSection.inputs),
      ]);

      for (const inputKey of inputKeys) {
        comparisonCount += 1;
        const previousInput = previousSection.inputs[inputKey];
        const currentInput = currentSection.inputs[inputKey];

        if (!previousInput) {
          changes.push({
            scope: 'input',
            operation: 'added',
            categoryKey,
            sectionKey,
            inputKey,
            fields: [{ field: '*', previousValue: null, currentValue: currentInput }],
          });
          continue;
        }
        if (!currentInput) {
          changes.push({
            scope: 'input',
            operation: 'removed',
            categoryKey,
            sectionKey,
            inputKey,
            fields: [{ field: '*', previousValue: previousInput, currentValue: null }],
          });
          continue;
        }

        const inputFieldChanges = fieldDiff(previousInput.fields, currentInput.fields);
        if (inputFieldChanges.length > 0) {
          changes.push({
            scope: 'input',
            operation: 'updated',
            categoryKey,
            sectionKey,
            inputKey,
            fields: inputFieldChanges,
          });
        }
      }
    }
  }

  const equal = changes.length === 0;
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const normalizedNodeCount =
    normalizedPrevious.meta.normalizedNodeCount + normalizedCurrent.meta.normalizedNodeCount;

  return createResult({
    equal,
    changes,
    metadata: buildMetadata({
      algorithm: NAME,
      durationMs,
      comparisonCount,
      normalizedNodeCount,
    }),
  });
}

module.exports = {
  name: NAME,
  compare,
};
