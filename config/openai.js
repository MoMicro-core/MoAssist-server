'use strict';

module.exports = {
  enabled: Boolean(process.env.OPENAI_KEY),
  key: process.env.OPENAI_KEY || '',
  chat: {
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
  },
  embeddings: {
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },
};
