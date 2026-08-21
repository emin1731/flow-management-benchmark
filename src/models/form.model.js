const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { withCamelCaseJSON } = require('./model-utils');

class Form extends Model {}

Form.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    labelInputKey: { type: DataTypes.STRING, field: 'label_input_key' },
    referenceIdInputKey: { type: DataTypes.STRING, field: 'reference_id_input_key' },
    hasSignStep: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'has_sign_step',
    },
    hasReviewStep: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'has_review_step',
    },
    formType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'registry',
      field: 'form_type',
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    prefix: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'DR',
      set(value) {
        this.setDataValue('prefix', value.toUpperCase());
      },
    },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    hasPeriod: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'has_period',
    },
    periodType: { type: DataTypes.ENUM('quarterly', 'monthly'), field: 'period_type' },
    periodDays: { type: DataTypes.INTEGER, field: 'period_days' },
  },
  {
    sequelize,
    modelName: 'Form',
    tableName: 'form',
    schema: 'admin',
    underscored: true,
    indexes: [{ unique: true, name: 'unique_form_key_version', fields: ['key', 'version'] }],
  },
);

module.exports = withCamelCaseJSON(Form);
