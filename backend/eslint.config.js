import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';

export default [
  { ignores: ['coverage/', 'uploads/', 'logs/', 'node_modules/'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error', // use the pino logger, which redacts secrets
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Flags every obj[key]; too noisy to be useful. Validate input with zod instead.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    // CLI tool: printing the results table is its job. The server itself must use the redacting logger.
    files: ['tests/load/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
