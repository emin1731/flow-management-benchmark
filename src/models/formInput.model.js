const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { withCamelCaseJSON } = require('./model-utils');

class FormInput extends Model {}

const nullableString = (field) => ({ type: DataTypes.STRING, field });

FormInput.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    formId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_id',
      references: { model: { tableName: 'form', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    formSectionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_section_id',
      references: { model: { tableName: 'form_section', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    orderIndex: { type: DataTypes.INTEGER, field: 'order_index' },
    dataType: {
      type: DataTypes.ENUM(
        'integer',
        'string',
        'boolean',
        'array',
        'object',
        'date',
        'timestamptz',
      ),
      allowNull: false,
      defaultValue: 'string',
      field: 'data_type',
    },
    specificType: {
      type: DataTypes.ENUM(
        'number',
        'textarea',
        'text',
        'voen',
        'file',
        'single_select',
        'multi_select',
        'date',
        'phone',
        'email',
        'link',
        'datetime',
        'checkbox',
      ),
      allowNull: false,
      defaultValue: 'text',
      field: 'specific_type',
    },
    value: { type: DataTypes.STRING },
    previousValue: { type: DataTypes.STRING, field: 'previous_value' },
    searchParam: { type: DataTypes.STRING, field: 'search_param' },
    path: { type: DataTypes.STRING },
    isRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_required',
    },
    hasAddableListView: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_addable_list_view',
    },
    isAddable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_addable',
    },
    hasAddManuallyOption: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_add_manually_option',
    },
    isUnique: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_unique',
    },
    isHidden: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_hidden',
    },
    isReadonly: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_readonly',
    },
    dependsOnType: nullableString('depends_on_type'),
    dependsOnKey: nullableString('depends_on_key'),
    parseTextTo: nullableString('parse_text_to'),
    dependsOnValue: nullableString('depends_on_value'),
    placeholder: { type: DataTypes.STRING },
    pattern: { type: DataTypes.STRING },
    minLength: { type: DataTypes.INTEGER, field: 'min_length' },
    maxLength: { type: DataTypes.INTEGER, field: 'max_length' },
    styleWidthCol: { type: DataTypes.INTEGER, field: 'style_width_col' },
    searchDependsOnType: nullableString('search_depends_on_type'),
    searchDependsOnKey: nullableString('search_depends_on_key'),
    searchDependsOnParam: nullableString('search_depends_on_param'),
    enableDependsOnType: nullableString('enable_depends_on_type'),
    enableDependsOnKey: nullableString('enable_depends_on_key'),
    enableDependsOnValue: nullableString('enable_depends_on_value'),
    prefillSourceKey: nullableString('prefill_source_key'),
    matchEnumByText: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'match_enum_by_text',
    },
  },
  {
    sequelize,
    modelName: 'FormInput',
    tableName: 'form_input',
    schema: 'admin',
    underscored: true,
    indexes: [{ unique: true, fields: ['form_id', 'key'] }],
  },
);

module.exports = withCamelCaseJSON(FormInput);
