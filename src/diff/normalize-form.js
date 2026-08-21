'use strict';

const { canonicalStringify } = require('./value-utils');

/**
 * Transport envelope fields emitted by the Admin API. They change on every
 * request and must never affect semantic equality.
 */
const TRANSPORT_FIELDS = ['app_name', 'timestamp', 'transaction', 'status', 'description', 'exception'];

/** Child containers - walked as structure, never compared as field values. */
const CHILD_CONTAINERS = ['sections', 'inputs'];

/**
 * Positional metadata. Order is captured separately on the node as `order` so
 * that a pure reorder produces no field changes and is reported only by the
 * ordering analysis.
 */
const ORDER_FIELDS = ['orderIndex'];

/**
 * Derived from Auth field permissions rather than authored in the form builder
 * (see json-template.service.js in the admin module). A permissions change is
 * not a form change, so it is excluded from the node diff.
 */
const DERIVED_FIELDS = ['reviews'];

/**
 * Accepts either a raw Admin API response ({ app_name, ..., data: {...} }) or
 * an already-unwrapped template ({ roleStructure, sortedKeys, formData }).
 *
 * @param {object} input
 * @returns {{roleStructure: object, sortedKeys: Array, formData: object}}
 */
function unwrap(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('normalizeForm expects an object.');
  }
  const payload = input.data && typeof input.data === 'object' ? input.data : input;

  if (!payload.formData || typeof payload.formData !== 'object') {
    throw new TypeError(
      'normalizeForm expects formData. The rich per-input fields (dataType, isRequired, ' +
        'validations, enumList) exist only there - sortedKeys carries ordering and labels only.'
    );
  }
  return {
    roleStructure: payload.roleStructure || {},
    sortedKeys: Array.isArray(payload.sortedKeys) ? payload.sortedKeys : [],
    formData: payload.formData,
  };
}

/**
 * Splits a raw node into its comparable field bag, dropping child containers,
 * positional metadata and derived fields.
 *
 * @param {object} node
 * @returns {object}
 */
function extractFields(node) {
  const fields = {};
  for (const [key, value] of Object.entries(node || {})) {
    if (CHILD_CONTAINERS.includes(key)) continue;
    if (ORDER_FIELDS.includes(key)) continue;
    if (DERIVED_FIELDS.includes(key)) continue;
    fields[key] = value;
  }
  return fields;
}

/**
 * Order of the children of one node, taken from sortedKeys when present (that
 * is the render order the user actually sees) and falling back to orderIndex,
 * then to object insertion order.
 *
 * @param {object} container keyed child map from formData
 * @param {Array} sortedChildren matching array slice from sortedKeys
 * @returns {string[]}
 */
function resolveOrder(container, sortedChildren) {
  const present = new Set(Object.keys(container || {}));

  if (Array.isArray(sortedChildren) && sortedChildren.length > 0) {
    const ordered = sortedChildren
      .map((child) => child && child.key)
      .filter((key) => present.has(key));
    // Anything in formData but absent from sortedKeys still has to appear.
    for (const key of present) {
      if (!ordered.includes(key)) ordered.push(key);
    }
    return ordered;
  }

  return [...present].sort((left, right) => {
    const leftIndex = container[left] && container[left].orderIndex;
    const rightIndex = container[right] && container[right].orderIndex;
    return (leftIndex ?? 0) - (rightIndex ?? 0);
  });
}

/**
 * Normalizes an Admin form template into a canonical, comparison-ready tree.
 *
 * Structure comes from formData (which carries dataType, isRequired,
 * validations and enumList) and order from sortedKeys. Transport fields are
 * dropped. Every node exposes:
 *
 *   { key, path, scope, order, fields, sections|inputs }
 *
 * @param {object} input
 * @returns {{categories: object, order: object, roleStructure: object, meta: object}}
 */
function normalizeForm(input) {
  const { roleStructure, sortedKeys, formData } = unwrap(input);

  const sortedByCategory = new Map(
    sortedKeys
      .filter((category) => category && category.key)
      .map((category) => [category.key, category])
  );

  const categories = {};
  const order = { categories: [], sections: {}, inputs: {} };
  const counts = { categories: 0, sections: 0, inputs: 0, enumValues: 0 };

  order.categories = resolveOrder(formData.categories, sortedKeys);

  for (const categoryKey of order.categories) {
    const rawCategory = formData.categories[categoryKey];
    const sortedCategory = sortedByCategory.get(categoryKey);
    counts.categories += 1;

    const sections = {};
    const sectionOrder = resolveOrder(rawCategory.sections, sortedCategory && sortedCategory.sections);
    order.sections[categoryKey] = sectionOrder;

    const sortedBySection = new Map(
      ((sortedCategory && sortedCategory.sections) || [])
        .filter((section) => section && section.key)
        .map((section) => [section.key, section])
    );

    for (const [sectionIndex, sectionKey] of sectionOrder.entries()) {
      const rawSection = rawCategory.sections[sectionKey];
      const sectionPath = categoryKey + '.' + sectionKey;
      counts.sections += 1;

      const inputs = {};
      const inputOrder = resolveOrder(rawSection.inputs, (sortedBySection.get(sectionKey) || {}).inputs);
      order.inputs[sectionPath] = inputOrder;

      for (const [inputIndex, inputKey] of inputOrder.entries()) {
        const rawInput = rawSection.inputs[inputKey];
        counts.inputs += 1;
        if (Array.isArray(rawInput.enumList)) counts.enumValues += rawInput.enumList.length;

        inputs[inputKey] = {
          key: inputKey,
          path: sectionPath + '.' + inputKey,
          scope: 'input',
          order: inputIndex,
          fields: extractFields(rawInput),
        };
      }

      sections[sectionKey] = {
        key: sectionKey,
        path: sectionPath,
        scope: 'section',
        order: sectionIndex,
        fields: extractFields(rawSection),
        inputs,
      };
    }

    categories[categoryKey] = {
      key: categoryKey,
      path: categoryKey,
      scope: 'category',
      order: order.categories.indexOf(categoryKey),
      fields: extractFields(rawCategory),
      sections,
    };
  }

  return {
    categories,
    order,
    roleStructure,
    meta: {
      normalizedNodeCount: counts.categories + counts.sections + counts.inputs,
      counts,
      roleStructureSize: canonicalStringify(roleStructure).length,
    },
  };
}

/**
 * Walks a normalized form, yielding every node once in document order.
 *
 * @param {object} normalized
 * @returns {Generator<{path: string, scope: string, node: object}>}
 */
function* walkNodes(normalized) {
  for (const category of Object.values(normalized.categories)) {
    yield { path: category.path, scope: 'category', node: category };
    for (const section of Object.values(category.sections)) {
      yield { path: section.path, scope: 'section', node: section };
      for (const input of Object.values(section.inputs)) {
        yield { path: input.path, scope: 'input', node: input };
      }
    }
  }
}

module.exports = { normalizeForm, walkNodes, TRANSPORT_FIELDS };
