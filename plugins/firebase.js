/* eslint-disable camelcase */
'use strict';

const fp = require('fastify-plugin');
const admin = require('firebase-admin');

const readCredential = () => {
  const privateKey =
    process.env.FIREBASE_PRIVATE_KEY || process.env.FBprivate_key || '';

  return {
    type: process.env.FIREBASE_TYPE || process.env.FBtype || 'service_account',
    project_id:
      process.env.FIREBASE_PROJECT_ID || process.env.FBproject_id || '',
    private_key_id:
      process.env.FIREBASE_PRIVATE_KEY_ID || process.env.FBprivate_key_id || '',
    private_key: privateKey.replace(/\\n/g, '\n'),
    client_email:
      process.env.FIREBASE_CLIENT_EMAIL || process.env.FBclient_email || '',
    client_id: process.env.FIREBASE_CLIENT_ID || process.env.FBclient_id || '',
    auth_uri: process.env.FIREBASE_AUTH_URI || process.env.FBauth_uri || '',
    token_uri: process.env.FIREBASE_TOKEN_URI || process.env.FBtoken_uri || '',
    auth_provider_x509_cert_url:
      process.env.FIREBASE_AUTH_PROVIDER_CERT_URL ||
      process.env.FBauth_provider_x509_cert_url ||
      '',
    client_x509_cert_url:
      process.env.FIREBASE_CLIENT_CERT_URL ||
      process.env.FBclient_x509_cert_url ||
      '',
    universe_domain:
      process.env.FIREBASE_UNIVERSE_DOMAIN ||
      process.env.FBuniverse_domain ||
      'googleapis.com',
  };
};

const firebasePlugin = async (fastify) => {
  const credential = readCredential();
  const configured = Boolean(
    credential.project_id && credential.client_email && credential.private_key,
  );

  if (!configured) {
    fastify.decorate('firebaseAdmin', null);
    fastify.decorate('firebaseAuth', null);
    return;
  }

  const app =
    admin.apps[0] ||
    admin.initializeApp({
      credential: admin.credential.cert(credential),
    });

  fastify.decorate('firebaseAdmin', app);
  fastify.decorate('firebaseAuth', admin.auth(app));
};

module.exports = fp(firebasePlugin, {
  fastify: '5.x',
});
