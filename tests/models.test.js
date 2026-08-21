const { Form, FormInput, FormSection } = require('../src/models');

describe('form models', () => {
  it('normalizes form prefixes and serializes API properties as camelCase', () => {
    const form = Form.build({ key: 'registry', label: 'Registry', prefix: 'dr' });

    expect(form.prefix).toBe('DR');
    expect(form.toJSON()).toMatchObject({ hasSignStep: true, formType: 'registry' });
    expect(form.toJSON()).not.toHaveProperty('has_sign_step');
  });

  it('defines the requested defaults and enum association', () => {
    const section = FormSection.build({
      key: 'details',
      label: 'Details',
      formId: 'form-id',
      formCategoryId: 'category-id',
    });
    const input = FormInput.build({
      key: 'name',
      label: 'Name',
      formId: 'form-id',
      formSectionId: 'section-id',
    });

    expect(section.noteStatus).toBe('info');
    expect(section.reviewRoleIds).toEqual([]);
    expect(input.dataType).toBe('string');
    expect(input.specificType).toBe('text');
    expect(FormInput.associations.enums).toBeDefined();
  });

  it('has the named form key/version uniqueness constraint', () => {
    const uniqueIndex = Form.options.indexes.find(
      (index) => index.name === 'unique_form_key_version',
    );

    expect(uniqueIndex).toMatchObject({ unique: true, fields: ['key', 'version'] });
  });
});
