'use strict';

const crypto = require('node:crypto');

const createId = () => crypto.randomUUID();

module.exports = { createId };
