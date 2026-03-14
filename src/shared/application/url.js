'use strict';

const getBaseUrl = (request, configuredUrl = '') => {
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProtocol)
    ? forwardedProtocol[0]
    : forwardedProtocol || request.protocol || 'http';
  return `${protocol}://${request.headers.host}`.replace(/\/$/, '');
};

const toWebsocketUrl = (baseUrl) =>
  baseUrl.startsWith('https://')
    ? baseUrl.replace('https://', 'wss://')
    : baseUrl.replace('http://', 'ws://');

module.exports = { getBaseUrl, toWebsocketUrl };
