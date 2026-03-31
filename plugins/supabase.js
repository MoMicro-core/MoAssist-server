'use strict';

const fp = require('fastify-plugin');
const { BadRequestError } = require('../src/shared/application/errors');

const encodeObjectPath = (value = '') =>
  String(value || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

class SupabaseStorageGateway {
  constructor(config = {}) {
    this.config = config;
    this.baseUrl = String(config.url || '').replace(/\/$/, '');
    this.serviceRoleKey = String(config.serviceRoleKey || '').trim();
    this.storageBucket = String(config.storageBucket || '').trim();
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.serviceRoleKey && this.storageBucket);
  }

  assertConfigured() {
    if (this.isConfigured()) return;
    throw new BadRequestError('Supabase storage is not configured');
  }

  buildPublicUrl(objectPath = '') {
    this.assertConfigured();
    const encodedBucket = encodeURIComponent(this.storageBucket);
    const encodedPath = encodeObjectPath(objectPath);
    return `${this.baseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
  }

  async uploadPublicObject({ objectPath, buffer, mimeType }) {
    this.assertConfigured();

    if (!objectPath || !buffer) {
      throw new BadRequestError('Storage upload payload is incomplete');
    }

    const encodedBucket = encodeURIComponent(this.storageBucket);
    const encodedPath = encodeObjectPath(objectPath);
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          apikey: this.serviceRoleKey,
          'Content-Type': mimeType || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: buffer,
      },
    );

    if (!response.ok) {
      const details = await response.text();
      throw new BadRequestError(
        details || 'Unable to upload the logo to Supabase storage',
      );
    }

    return {
      objectPath,
      publicUrl: this.buildPublicUrl(objectPath),
    };
  }
}

const supabasePlugin = async (fastify) => {
  fastify.decorate(
    'supabaseStorage',
    new SupabaseStorageGateway(fastify.config.supabase),
  );
};

module.exports = fp(supabasePlugin, {
  fastify: '5.x',
});
