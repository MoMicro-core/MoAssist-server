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
    await this.uploadObject({ objectPath, buffer, mimeType });

    return {
      objectPath,
      publicUrl: this.buildPublicUrl(objectPath),
    };
  }

  async uploadObject({ bucket = '', objectPath, buffer, mimeType }) {
    this.assertConfigured();

    if (!objectPath || !buffer) {
      throw new BadRequestError('Storage upload payload is incomplete');
    }

    const encodedBucket = encodeURIComponent(bucket || this.storageBucket);
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
        details || 'Unable to upload the object to Supabase storage',
      );
    }

    return { objectPath };
  }

  // Creates a bucket if it does not exist yet (private by default).
  async ensureBucket({ bucket, isPublic = false }) {
    this.assertConfigured();
    if (!bucket) throw new BadRequestError('Bucket name is required');

    const response = await fetch(`${this.baseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        apikey: this.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: bucket, name: bucket, public: isPublic }),
    });

    if (response.ok) return { bucket, created: true };

    const details = await response.text();
    if (/already exists|duplicate/i.test(details)) {
      return { bucket, created: false };
    }
    throw new BadRequestError(details || 'Unable to create the bucket');
  }

  async downloadObject({ bucket = '', objectPath }) {
    this.assertConfigured();

    if (!objectPath) {
      throw new BadRequestError('Storage object path is required');
    }

    const encodedBucket = encodeURIComponent(bucket || this.storageBucket);
    const encodedPath = encodeObjectPath(objectPath);
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`,
      {
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          apikey: this.serviceRoleKey,
        },
      },
    );

    if (!response.ok) {
      const details = await response.text();
      throw new BadRequestError(
        details || 'Unable to download the object from Supabase storage',
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject({ bucket = '', objectPath }) {
    this.assertConfigured();

    if (!objectPath) {
      throw new BadRequestError('Storage object path is required');
    }

    const encodedBucket = encodeURIComponent(bucket || this.storageBucket);
    const encodedPath = encodeObjectPath(objectPath);
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          apikey: this.serviceRoleKey,
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      throw new BadRequestError(
        details || 'Unable to delete the object from Supabase storage',
      );
    }

    return { objectPath };
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
module.exports.SupabaseStorageGateway = SupabaseStorageGateway;
