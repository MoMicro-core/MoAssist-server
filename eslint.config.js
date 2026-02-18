'use strict';

const init = require('eslint-config-metarhia');

module.exports = [
  // Extend metarhia config (assumes it's Flat-compatible)
  ...init,

  // Add Jest environment
  {
    files: ['**/*.test.js', '**/__tests__/**/*.js', 'test/**/*.js'],
    languageOptions: {
      globals: {
        beforeAll: true,
        afterAll: true,
        beforeEach: true,
        afterEach: true,
        it: true,
        test: true,
        expect: true,
        describe: true,
        jest: true,
        fastifyInstance: true,
        getTestUsers: true,
        getTestTokens: true,
        global: true,
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'max-len': 'off',
    },
  },
  {
    ignores: ['static/**', 'node_modules/**'],
  },
];
