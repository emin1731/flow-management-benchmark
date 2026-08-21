'use strict';

/**
 * Mutation helpers for building diff scenarios out of a real Admin template.
 *
 * Every helper edits BOTH `formData` (the rich half, where dataType /
 * isRequired / validations / enumList live) and `sortedKeys` (the render
 * order). Editing only one produces a template the real system could never
 * emit, which would make the scenario meaningless.
 */

/** @param {object} form @returns {object} deep clone */
function clone(form) {
  return JSON.parse(JSON.stringify(form));
}

/** @param {object} form @returns {object} the unwrapped `data` payload */
function payload(form) {
  return form.data && form.data.formData ? form.data : form;
}

function findCategory(form, categoryKey) {
  return payload(form).formData.categories[categoryKey];
}

function findSection(form, categoryKey, sectionKey) {
  return findCategory(form, categoryKey).sections[sectionKey];
}

function sortedCategory(form, categoryKey) {
  return payload(form).sortedKeys.find((category) => category.key === categoryKey);
}

function sortedSection(form, categoryKey, sectionKey) {
  const category = sortedCategory(form, categoryKey);
  return category && category.sections.find((section) => section.key === sectionKey);
}

/**
 * Changes a transport-only field. Must never be treated as a form change.
 *
 * @param {object} form
 * @returns {object}
 */
function touchTransport(form) {
  const next = clone(form);
  next.timestamp = '2026-01-01 00:00:00';
  next.transaction = '00000000-0000-4000-8000-000000000000';
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} inputKey
 * @param {string} field
 * @param {*} value
 * @returns {object}
 */
function setInputField(form, categoryKey, sectionKey, inputKey, field, value) {
  const next = clone(form);
  findSection(next, categoryKey, sectionKey).inputs[inputKey][field] = value;

  if (field === 'label') {
    const section = sortedSection(next, categoryKey, sectionKey);
    const input = section && section.inputs.find((entry) => entry.key === inputKey);
    if (input) input.label = value;
  }
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} field
 * @param {*} value
 * @returns {object}
 */
function setSectionField(form, categoryKey, sectionKey, field, value) {
  const next = clone(form);
  findSection(next, categoryKey, sectionKey)[field] = value;
  if (field === 'label') {
    const section = sortedSection(next, categoryKey, sectionKey);
    if (section) section.label = value;
  }
  return next;
}

/**
 * Renames an input key in place, keeping its position and every other field.
 *
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {object}
 */
function renameInput(form, categoryKey, sectionKey, fromKey, toKey) {
  const next = clone(form);
  const section = findSection(next, categoryKey, sectionKey);

  const rebuilt = {};
  for (const [key, input] of Object.entries(section.inputs)) {
    if (key === fromKey) {
      rebuilt[toKey] = { ...input, key: toKey };
    } else {
      rebuilt[key] = input;
    }
  }
  section.inputs = rebuilt;

  const sorted = sortedSection(next, categoryKey, sectionKey);
  if (sorted) {
    const entry = sorted.inputs.find((input) => input.key === fromKey);
    if (entry) entry.key = toKey;
  }
  return next;
}

/**
 * Moves an input to another section, keeping its key and fields identical.
 *
 * @param {object} form
 * @param {{category: string, section: string, input: string}} from
 * @param {{category: string, section: string}} to
 * @returns {object}
 */
function moveInput(form, from, to) {
  const next = clone(form);
  const source = findSection(next, from.category, from.section);
  const target = findSection(next, to.category, to.section);

  const input = source.inputs[from.input];
  delete source.inputs[from.input];
  target.inputs[from.input] = input;

  const sortedSource = sortedSection(next, from.category, from.section);
  const sortedTarget = sortedSection(next, to.category, to.section);
  if (sortedSource && sortedTarget) {
    const index = sortedSource.inputs.findIndex((entry) => entry.key === from.input);
    if (index >= 0) sortedTarget.inputs.push(...sortedSource.inputs.splice(index, 1));
  }
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} inputKey
 * @returns {object}
 */
function removeInput(form, categoryKey, sectionKey, inputKey) {
  const next = clone(form);
  delete findSection(next, categoryKey, sectionKey).inputs[inputKey];

  const sorted = sortedSection(next, categoryKey, sectionKey);
  if (sorted) sorted.inputs = sorted.inputs.filter((entry) => entry.key !== inputKey);
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {object} definition partial input definition; sensible defaults applied
 * @returns {object}
 */
function addInput(form, categoryKey, sectionKey, definition) {
  const next = clone(form);
  const section = findSection(next, categoryKey, sectionKey);

  const input = {
    dependOn: { existence: null, search: null, enable: null },
    key: definition.key,
    label: definition.label || definition.key,
    orderIndex: Object.keys(section.inputs).length + 1,
    dataType: definition.dataType || 'string',
    specificType: definition.specificType || 'text',
    value: null,
    previousValue: null,
    searchParam: null,
    path: null,
    hasAddableListView: false,
    isAddable: false,
    hasAddManuallyOption: false,
    isUnique: false,
    isHidden: false,
    isReadonly: false,
    parseTextTo: null,
    placeholder: '',
    styleWidthCol: 12,
    prefillSourceKey: null,
    matchEnumByText: false,
    isRequired: definition.isRequired || false,
    validations: definition.validations || (definition.isRequired ? { isRequired: true } : {}),
    enumList: definition.enumList || [],
  };

  section.inputs[definition.key] = input;

  const sorted = sortedSection(next, categoryKey, sectionKey);
  if (sorted) {
    sorted.inputs.push({
      key: input.key,
      label: input.label,
      isAddable: false,
      dependOn: { existence: null, search: null, enable: null },
    });
  }
  return next;
}

/**
 * Reverses the input order of a section without touching any field value.
 *
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @returns {object}
 */
function reverseInputOrder(form, categoryKey, sectionKey) {
  const next = clone(form);
  const section = findSection(next, categoryKey, sectionKey);

  const entries = Object.entries(section.inputs).reverse();
  section.inputs = Object.fromEntries(
    entries.map(([key, input], index) => [key, { ...input, orderIndex: index + 1 }])
  );

  const sorted = sortedSection(next, categoryKey, sectionKey);
  if (sorted) sorted.inputs = [...sorted.inputs].reverse();
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @returns {object}
 */
function removeSection(form, categoryKey, sectionKey) {
  const next = clone(form);
  delete findCategory(next, categoryKey).sections[sectionKey];

  const category = sortedCategory(next, categoryKey);
  if (category) {
    category.sections = category.sections.filter((section) => section.key !== sectionKey);
    category.sectionCount = category.sections.length;
  }
  return next;
}

/**
 * @param {object} form
 * @param {string} categoryKey
 * @returns {object}
 */
function removeCategory(form, categoryKey) {
  const next = clone(form);
  delete payload(next).formData.categories[categoryKey];
  payload(next).sortedKeys = payload(next).sortedKeys.filter((category) => category.key !== categoryKey);
  return next;
}

/**
 * Adds an enum entry to a select input.
 *
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} inputKey
 * @param {object} entry
 * @returns {object}
 */
function addEnumValue(form, categoryKey, sectionKey, inputKey, entry) {
  const next = clone(form);
  const input = findSection(next, categoryKey, sectionKey).inputs[inputKey];
  input.enumList = [...(input.enumList || []), entry];
  return next;
}

/**
 * Removes the last enum entry from a select input.
 *
 * @param {object} form
 * @param {string} categoryKey
 * @param {string} sectionKey
 * @param {string} inputKey
 * @returns {object}
 */
function removeLastEnumValue(form, categoryKey, sectionKey, inputKey) {
  const next = clone(form);
  const input = findSection(next, categoryKey, sectionKey).inputs[inputKey];
  input.enumList = (input.enumList || []).slice(0, -1);
  return next;
}

module.exports = {
  addEnumValue,
  addInput,
  clone,
  moveInput,
  removeCategory,
  removeInput,
  removeLastEnumValue,
  removeSection,
  renameInput,
  reverseInputOrder,
  setInputField,
  setSectionField,
  touchTransport,
};
