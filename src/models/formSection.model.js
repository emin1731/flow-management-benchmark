const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { withCamelCaseJSON } = require('./model-utils');

class FormSection extends Model {}

FormSection.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    formId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_id',
      references: { model: { tableName: 'form', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    formCategoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_category_id',
      references: { model: { tableName: 'form_category', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    information: { type: DataTypes.TEXT },
    listValue: { type: DataTypes.STRING, defaultValue: '', field: 'list_value' },
    orderIndex: { type: DataTypes.INTEGER, field: 'order_index' },
    organizationComment: { type: DataTypes.TEXT, defaultValue: '', field: 'organization_comment' },
    hasConflict: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_conflict',
    },
    hasAddableList: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_addable_list',
    },
    isAddableListRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_addable_list_required',
    },
    isDynamic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_dynamic',
    },
    isRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_required',
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    isChecked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_checked',
    },
    reviewRoleIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      field: 'review_role_ids',
    },
    dependsOnType: { type: DataTypes.STRING, field: 'depends_on_type' },
    dependsOnKey: { type: DataTypes.STRING, field: 'depends_on_key' },
    dependsOnValue: { type: DataTypes.STRING, field: 'depends_on_value' },
    note: { type: DataTypes.TEXT, defaultValue: '' },
    noteStatus: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'success'),
      defaultValue: 'info',
      field: 'note_status',
    },
    noteTitle: { type: DataTypes.STRING, defaultValue: '', field: 'note_title' },
    validationRules: { type: DataTypes.JSONB, field: 'validation_rules' },
    prefillSourceKey: { type: DataTypes.STRING, field: 'prefill_source_key' },
  },
  {
    sequelize,
    modelName: 'FormSection',
    tableName: 'form_section',
    schema: 'admin',
    underscored: true,
    indexes: [{ unique: true, fields: ['form_id', 'key'] }],
  },
);

module.exports = withCamelCaseJSON(FormSection);
