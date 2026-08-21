'use strict';

const { normalizeForm } = require('../normalize-form');
const { diffValue } = require('../value-utils');
const { buildMetadata, createResult } = require('../algorithm.interface');

const NAME = 'recursive-json-diff';

/**
 * Recursively diffs the canonical form tree at every level (category,
 * section, input) and, within each node, recursively diffs every field
 * (including nested objects/arrays such as `dependOn`) using a generic
 * object/array walker. This produces fine-grained, path-addressed change
 * entries, e.g.:
 *
 *   {
 *     type: 'updated',
 *     scope: 'input',
 *     path: 'serviceInformation.serviceNameAndDescription.inputs.serviceId.label',
 *     previousValue: 'Old label',
 *     currentValue: 'New label'
 *   }
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
  const countingHook = { onCompare: () => (comparisonCount += 1) };
  const changes = [];

  const pushStructural = (scope, operation, path, previousValue, currentValue) => {
    changes.push({ type: operation, scope, path, previousValue, currentValue });
  };

  const diffFields = (scope, node, previousFields, currentFields) => {
    const fieldChanges = diffValue(previousFields, currentFields, node.path, countingHook);
    for (const change of fieldChanges) {
      changes.push({ type: change.type, scope, path: change.path, previousValue: change.previousValue, currentValue: change.currentValue });
    }
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
      pushStructural('category', 'added', categoryKey, null, currentCategory);
      continue;
    }
    if (!currentCategory) {
      pushStructural('category', 'removed', categoryKey, previousCategory, null);
      continue;
    }

    diffFields('category', previousCategory, previousCategory.fields, currentCategory.fields);

    const sectionKeys = new Set([
      ...Object.keys(previousCategory.sections),
      ...Object.keys(currentCategory.sections),
    ]);

    for (const sectionKey of sectionKeys) {
      comparisonCount += 1;
      const previousSection = previousCategory.sections[sectionKey];
      const currentSection = currentCategory.sections[sectionKey];
      const sectionPath = `${categoryKey}.${sectionKey}`;

      if (!previousSection) {
        pushStructural('section', 'added', sectionPath, null, currentSection);
        continue;
      }
      if (!currentSection) {
        pushStructural('section', 'removed', sectionPath, previousSection, null);
        continue;
      }

      diffFields('section', previousSection, previousSection.fields, currentSection.fields);

      const inputKeys = new Set([
        ...Object.keys(previousSection.inputs),
        ...Object.keys(currentSection.inputs),
      ]);

      for (const inputKey of inputKeys) {
        comparisonCount += 1;
        const previousInput = previousSection.inputs[inputKey];
        const currentInput = currentSection.inputs[inputKey];
        const inputPath = `${sectionPath}.inputs.${inputKey}`;

        if (!previousInput) {
          pushStructural('input', 'added', inputPath, null, currentInput);
          continue;
        }
        if (!currentInput) {
          pushStructural('input', 'removed', inputPath, previousInput, null);
          continue;
        }

        diffFields('input', previousInput, previousInput.fields, currentInput.fields);
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
