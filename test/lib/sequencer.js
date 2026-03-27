'use strict';

const Sequencer = require('@jest/test-sequencer').default;

class StableSequencer extends Sequencer {}

module.exports = StableSequencer;
