'use strict';

module.exports = {
  testResultsProcessor: '<rootDir>/test/lib/testProcessor.js',
  displayName: 'rstays-api',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  bail: false,
  maxWorkers: 1,
  testSequencer: '<rootDir>/test/lib/sequencer.js',
};
