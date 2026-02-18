/* eslint-disable camelcase */
'use strict';

const fp = require('fastify-plugin');
const admin = require('firebase-admin');

const firebasePlugin = async (fastify) => {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        type: process.env['FBtype'],
        project_id: process.env['FBproject_id'],
        private_key_id: process.env['FBprivate_key_id'],
        private_key: process.env['FBprivate_key'],
        client_email: process.env['FBclient_email'],
        client_id: process.env['FBclient_id'],
        auth_uri: process.env['FBauth_uri'],
        token_uri: process.env['FBtoken_uri'],
        auth_provider_x509_cert_url:
          process.env['FBauth_provider_x509_cert_url'],
        client_x509_cert_url: process.env['FBclient_x509_cert_url'],
        universe_domain: process.env['FBuniverse_domain'],
      }),
    });
    fastify.decorate('firebase', admin);
    fastify.log.info('firebase connected');
  } catch (err) {
    fastify.log.error(err);
  }
};

module.exports = fp(firebasePlugin, {
  fastify: '5.x',
});
