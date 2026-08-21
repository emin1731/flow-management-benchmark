const camelCase = (value) =>
  value.replace(/_([a-z])/g, (_match, character) => character.toUpperCase());

const withCamelCaseJSON = (Model) => {
  Model.prototype.toJSON = function toJSON() {
    const values = { ...this.get() };

    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [camelCase(key), value]),
    );
  };

  return Model;
};

module.exports = { withCamelCaseJSON };
