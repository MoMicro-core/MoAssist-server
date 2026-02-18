'use strict';

module.exports = {
  url: process.env['MONGODB_URL'] || '',
  database: process.env['DATABASE_NAME'] || 'db',
};
