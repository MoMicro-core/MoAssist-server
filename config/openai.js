'use strict';

module.exports = {
  enabled: true,
  system: ``,
  chat: {
    model: 'gpt-4.1',
  },
  key: process.env['OPENAI_KEY'] || '',
};
