const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { withCamelCaseJSON } = require('./model-utils');

class FormCategory extends Model {}

FormCategory.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    formId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_id',
      references: { model: { tableName: 'form', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, field: 'order_index' },
    prefillSourceUrl: { type: DataTypes.STRING, field: 'prefill_source_url' },
  },
  {
    sequelize,
    modelName: 'FormCategory',
    tableName: 'form_category',
    schema: 'admin',
    underscored: true,
    indexes: [{ unique: true, fields: ['form_id', 'key'] }],
  },
);

module.exports = withCamelCaseJSON(FormCategory);
