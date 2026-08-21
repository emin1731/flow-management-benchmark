const Form = require('./form.model');
const FormCategory = require('./formCategory.model');
const FormSection = require('./formSection.model');
const FormInput = require('./formInput.model');
const EnumList = require('./enumList.model');

Form.hasMany(FormCategory, { foreignKey: 'formId', as: 'categories', onDelete: 'CASCADE' });
FormCategory.belongsTo(Form, { foreignKey: 'formId', as: 'form', onDelete: 'CASCADE' });
FormCategory.hasMany(FormSection, {
  foreignKey: 'formCategoryId',
  as: 'sections',
  onDelete: 'CASCADE',
});
FormSection.belongsTo(FormCategory, {
  foreignKey: 'formCategoryId',
  as: 'category',
  onDelete: 'CASCADE',
});
FormSection.hasMany(FormInput, { foreignKey: 'formSectionId', as: 'inputs', onDelete: 'CASCADE' });
FormInput.belongsTo(FormSection, {
  foreignKey: 'formSectionId',
  as: 'section',
  onDelete: 'CASCADE',
});
FormInput.hasMany(EnumList, { foreignKey: 'formInputId', as: 'enums', onDelete: 'CASCADE' });
EnumList.belongsTo(FormInput, { foreignKey: 'formInputId', as: 'input', onDelete: 'CASCADE' });

module.exports = { Form, FormCategory, FormSection, FormInput, EnumList };
