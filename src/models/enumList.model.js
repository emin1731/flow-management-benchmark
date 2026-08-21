const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const { withCamelCaseJSON } = require('./model-utils');

class EnumList extends Model {}

EnumList.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    formInputId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'form_input_id',
      references: { model: { tableName: 'form_input', schema: 'admin' }, key: 'id' },
      onDelete: 'CASCADE',
    },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 1, field: 'order_index' },
    value: { type: DataTypes.STRING, allowNull: false },
    text: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, modelName: 'EnumList', tableName: 'enum_list', schema: 'admin', underscored: true },
);

module.exports = withCamelCaseJSON(EnumList);
