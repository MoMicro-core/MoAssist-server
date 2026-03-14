'use strict';

module.exports = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  appUrl: process.env.APP_URL || '',
  productName: 'MoMicro Assist',
};
