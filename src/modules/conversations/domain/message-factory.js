'use strict';

const { createId } = require('../../../shared/application/ids');

const createMessage = (authorType, content) => ({
  id: createId(),
  authorType,
  content,
  createdAt: new Date(),
  readByOwner: authorType !== 'visitor',
});

module.exports = { createMessage };
