'use strict';

const path = require('node:path');
const { discoverFixtures } = require('../fixture-loader');
const mutate = require('./mutations');

/**
 * Ground-truth scenarios.
 *
 * The four checked-in fixtures only ever differ by two label edits and one
 * removed category, so on their own they cannot exercise rename, move,
 * reorder, type change, required-flag flip, enum change or validation change -
 * which is most of what the diff exists to detect.
 *
 * Rather than hand-maintaining a dozen more 200 KB JSON files, each scenario
 * derives its "current" side by mutating the real v1 template. That keeps the
 * data realistic (99 real nodes) while making the expected outcome exact.
 *
 * `expected` is deliberately capability-shaped rather than output-shaped: the
 * four algorithms emit different change vocabularies, so a scenario asserts
 * WHAT must be detected, not the literal JSON an algorithm returns.
 */

const FIXTURES_DIRECTORY = path.resolve(__dirname, '../../../');

// A real section of the real template, used as the mutation target.
const TARGET = {
  category: 'serviceInformation',
  section: 'providerOrganization',
  input: 'subProviderOrgName',
};

const ENUM_TARGET = {
  category: 'serviceInformation',
  section: 'serviceStatus',
  input: 'serviceStatusValue',
};

const REQUIRED_TARGET = {
  category: 'serviceInformation',
  section: 'serviceNameAndDescription',
  input: 'serviceId',
};

const targetPath = `${TARGET.category}.${TARGET.section}.${TARGET.input}`;
const enumPath = `${ENUM_TARGET.category}.${ENUM_TARGET.section}.${ENUM_TARGET.input}`;
const requiredPath = `${REQUIRED_TARGET.category}.${REQUIRED_TARGET.section}.${REQUIRED_TARGET.input}`;

/**
 * @returns {object[]} fixtures ordered by version
 */
function loadFixtures() {
  return discoverFixtures(FIXTURES_DIRECTORY);
}

/**
 * @returns {Array} scenario descriptors
 */
function buildScenarios() {
  const fixtures = loadFixtures();
  const byVersion = new Map(fixtures.map((fixture) => [fixture.version, fixture.form]));
  const v1 = byVersion.get(1);

  /** Derived scenarios: real base template, precisely known mutation. */
  const synthetic = [
    {
      name: 'identical',
      group: 'equality',
      description: 'The same template submitted twice.',
      previous: v1,
      current: mutate.clone(v1),
      expected: { equal: true, verdict: 'safe', touched: [], operations: {} },
    },
    {
      name: 'transport-only',
      group: 'equality',
      description: 'Only timestamp and transaction differ. Must not create a version.',
      previous: v1,
      current: mutate.touchTransport(v1),
      expected: { equal: true, verdict: 'safe', touched: [], operations: {} },
    },
    {
      name: 'label-edited',
      group: 'presentation',
      description: 'An input label is rewritten.',
      previous: v1,
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'label', 'Yeni etiket'),
      expected: { equal: false, verdict: 'safe', touched: [targetPath], operations: { modified: 1 } },
    },
    {
      name: 'section-description-edited',
      group: 'presentation',
      description: 'A section description is rewritten.',
      previous: v1,
      current: mutate.setSectionField(v1, TARGET.category, TARGET.section, 'description', 'Yenilənmiş izah'),
      expected: {
        equal: false,
        verdict: 'safe',
        touched: [`${TARGET.category}.${TARGET.section}`],
        operations: { modified: 1 },
      },
    },
    {
      name: 'input-reordered',
      group: 'ordering',
      description: 'Inputs of one section are reversed. No field value changes.',
      previous: v1,
      current: mutate.reverseInputOrder(v1, TARGET.category, TARGET.section),
      expected: { equal: false, verdict: 'safe', touched: [], operations: {}, reordered: true },
    },
    {
      name: 'input-added-optional',
      group: 'structure',
      description: 'A new optional input is appended to a section.',
      previous: v1,
      current: mutate.addInput(v1, TARGET.category, TARGET.section, {
        key: 'providerContactEmail',
        label: 'Əlaqə e-poçtu',
        dataType: 'string',
      }),
      expected: {
        equal: false,
        verdict: 'safe',
        touched: [`${TARGET.category}.${TARGET.section}.providerContactEmail`],
        operations: { added: 1 },
      },
    },
    {
      name: 'input-added-required',
      group: 'structure',
      description: 'A new REQUIRED input is added - existing appeals have no value for it.',
      previous: v1,
      current: mutate.addInput(v1, TARGET.category, TARGET.section, {
        key: 'providerLicenceNumber',
        label: 'Lisenziya nömrəsi',
        dataType: 'string',
        isRequired: true,
      }),
      expected: {
        equal: false,
        verdict: 'requires-review',
        touched: [`${TARGET.category}.${TARGET.section}.providerLicenceNumber`],
        operations: { added: 1 },
      },
    },
    {
      name: 'input-removed',
      group: 'structure',
      description: 'An input is deleted. Stored input_values rows orphan.',
      previous: v1,
      current: mutate.removeInput(v1, TARGET.category, TARGET.section, TARGET.input),
      expected: { equal: false, verdict: 'breaking', touched: [targetPath], operations: { removed: 1 } },
    },
    {
      name: 'input-renamed',
      group: 'identity',
      description: 'An input key changes; every other field is identical.',
      previous: v1,
      current: mutate.renameInput(v1, TARGET.category, TARGET.section, TARGET.input, 'subProviderTitle'),
      expected: {
        equal: false,
        verdict: 'breaking',
        touched: [targetPath, `${TARGET.category}.${TARGET.section}.subProviderTitle`],
        operations: { renamed: 1 },
        requiresPairing: true,
      },
    },
    {
      name: 'input-moved',
      group: 'identity',
      description:
        'An input moves to another section, same key. input_values is keyed by key alone, so values survive.',
      previous: v1,
      current: mutate.moveInput(
        v1,
        { category: TARGET.category, section: TARGET.section, input: TARGET.input },
        { category: TARGET.category, section: 'serviceActivationDate' }
      ),
      expected: {
        equal: false,
        verdict: 'requires-review',
        touched: [targetPath, `${TARGET.category}.serviceActivationDate.${TARGET.input}`],
        operations: { moved: 1 },
        requiresPairing: true,
      },
    },
    {
      name: 'datatype-changed',
      group: 'compatibility',
      description: 'An input changes dataType - stored values may no longer parse.',
      previous: v1,
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'dataType', 'integer'),
      expected: { equal: false, verdict: 'breaking', touched: [targetPath], operations: { modified: 1 } },
    },
    {
      name: 'optional-became-required',
      group: 'compatibility',
      description: 'An optional input becomes required - existing appeals may be incomplete.',
      previous: v1,
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'isRequired', true),
      expected: { equal: false, verdict: 'breaking', touched: [targetPath], operations: { modified: 1 } },
    },
    {
      name: 'required-became-optional',
      group: 'compatibility',
      description: 'A required input becomes optional - never invalidates stored data.',
      previous: v1,
      current: mutate.setInputField(
        v1,
        REQUIRED_TARGET.category,
        REQUIRED_TARGET.section,
        REQUIRED_TARGET.input,
        'isRequired',
        false
      ),
      expected: {
        equal: false,
        verdict: 'requires-review',
        touched: [requiredPath],
        operations: { modified: 1 },
      },
    },
    {
      // Both sides carry an explicit maxLength so the DIRECTION of the change is
      // unambiguous. Starting from the shipped `validations: {}` would make this
      // "a cap where there was none", which is itself a tightening.
      name: 'validation-tightened',
      group: 'compatibility',
      description: 'maxLength is lowered from 200 to 10 - previously valid answers may now fail.',
      previous: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'validations', {
        maxLength: 200,
      }),
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'validations', {
        maxLength: 10,
      }),
      expected: { equal: false, verdict: 'breaking', touched: [targetPath], operations: { modified: 1 } },
    },
    {
      name: 'validation-relaxed',
      group: 'compatibility',
      description: 'maxLength is raised from 50 to 4096 - no stored answer can become invalid.',
      previous: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'validations', {
        maxLength: 50,
      }),
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'validations', {
        maxLength: 4096,
      }),
      expected: {
        equal: false,
        verdict: 'requires-review',
        touched: [targetPath],
        operations: { modified: 1 },
      },
    },
    {
      name: 'validation-cap-introduced',
      group: 'compatibility',
      description: 'A maxLength appears where the field was previously unbounded - a tightening.',
      previous: v1,
      current: mutate.setInputField(v1, TARGET.category, TARGET.section, TARGET.input, 'validations', {
        maxLength: 64,
      }),
      expected: { equal: false, verdict: 'breaking', touched: [targetPath], operations: { modified: 1 } },
    },
    {
      name: 'enum-value-added',
      group: 'compatibility',
      description: 'A new option is added to a select - existing selections stay valid.',
      previous: v1,
      current: mutate.addEnumValue(v1, ENUM_TARGET.category, ENUM_TARGET.section, ENUM_TARGET.input, {
        key: 'suspended',
        label: 'Dayandırılıb',
        orderIndex: 99,
      }),
      expected: { equal: false, verdict: 'safe', touched: [enumPath], operations: { modified: 1 } },
    },
    {
      name: 'enum-value-removed',
      group: 'compatibility',
      description: 'An option disappears - appeals that selected it now hold an invalid value.',
      previous: v1,
      current: mutate.removeLastEnumValue(
        v1,
        ENUM_TARGET.category,
        ENUM_TARGET.section,
        ENUM_TARGET.input
      ),
      expected: {
        equal: false,
        verdict: 'requires-review',
        touched: [enumPath],
        operations: { modified: 1 },
      },
    },
    {
      name: 'section-removed',
      group: 'structure',
      description: 'A whole section and its inputs disappear.',
      previous: v1,
      current: mutate.removeSection(v1, TARGET.category, TARGET.section),
      expected: {
        equal: false,
        verdict: 'breaking',
        touched: [`${TARGET.category}.${TARGET.section}`],
        operations: { removed: 5 },
      },
    },
  ];

  /** Real adjacent fixture pairs, with expectations derived from their actual content. */
  const realWorld = [
    {
      name: 'real-v1-to-v2',
      group: 'real',
      description: 'Shipped fixtures: one input label rewritten.',
      previous: byVersion.get(1),
      current: byVersion.get(2),
      expected: {
        equal: false,
        verdict: 'safe',
        touched: ['economicAndTechnicalIndicators.onlineApplyGrowth.onlineApplyGrowthPercent'],
        operations: { modified: 1 },
      },
    },
    {
      name: 'real-v2-to-v3',
      group: 'real',
      description: 'Shipped fixtures: a section label and description rewritten.',
      previous: byVersion.get(2),
      current: byVersion.get(3),
      expected: {
        equal: false,
        verdict: 'safe',
        touched: ['serviceUsageStats.reportingPeriod'],
        operations: { modified: 1 },
      },
    },
    {
      name: 'real-v3-to-v4',
      group: 'real',
      description: 'Shipped fixtures: the geographicDistribution category is deleted.',
      previous: byVersion.get(3),
      current: byVersion.get(4),
      expected: {
        equal: false,
        verdict: 'breaking',
        touched: ['geographicDistribution'],
        operations: { removed: 6 },
      },
    },
  ];

  return [...synthetic, ...realWorld];
}

module.exports = { buildScenarios, loadFixtures, TARGET, ENUM_TARGET, REQUIRED_TARGET };
