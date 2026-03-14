'use strict';

const path = require('node:path');
const fp = require('fastify-plugin');
const mongoose = require('mongoose');
const { loadDir } = require('../lib/loader');

const mongoPlugin = async (fastify) => {
  const database = fastify.config.mongodb.url;

  await mongoose.connect(database, {
    dbName: fastify.config.mongodb.database,
  });

  const definitions = await loadDir(path.join(process.cwd(), './models'));
  const models = {};

  for (const [name, definition] of Object.entries(definitions)) {
    const schema = new mongoose.Schema(
      definition.properties,
      definition.params,
    );

    if (Array.isArray(definition.indexes)) {
      for (const [fields, options] of definition.indexes) {
        schema.index(fields, options || {});
      }
    }

    models[name] =
      mongoose.models[name] || mongoose.model(name, schema, `${name}s`);
  }

  fastify.decorate('mongodb', models);
  fastify.addHook('onClose', async () => {
    await mongoose.disconnect();
  });
};

module.exports = fp(mongoPlugin, {
  fastify: '5.x',
});
