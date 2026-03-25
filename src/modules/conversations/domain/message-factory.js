'use strict';

const { createId } = require('../../../shared/application/ids');

const getMessageAuthor = (authorType) =>
  authorType === 'assistant' ? 'ai' : 'human';

const createMessage = (authorType, content) => ({
  id: createId(),
  authorType,
  author: getMessageAuthor(authorType),
  content,
  createdAt: new Date(),
  read: false,
  readByOwner: authorType !== 'visitor',
  readByVisitor: authorType === 'visitor',
});

module.exports = { createMessage, getMessageAuthor };
