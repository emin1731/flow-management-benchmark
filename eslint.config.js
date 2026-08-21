const eslint = require('@eslint/js');
const globals = require('globals');

module.exports = [
  eslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
