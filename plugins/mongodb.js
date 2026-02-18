'use strict';

const path = require('node:path');
const fp = require('fastify-plugin');
const mongoose = require('mongoose');
const { loadDir } = require('../lib/loader');

const mongoPlugin = async (fastify) => {
  try {
    const { config } = fastify;
    const database = config.mongodb.url;
    await mongoose.connect(database, {
      dbName: config.mongodb.database,
    });
    const models = await loadDir(path.join(process.cwd(), './models'));
    const schemas = {};
    for (const [name, model] of Object.entries(models)) {
      const schema = new mongoose.Schema(model.properties, model.params);
      if (model.settings) {
        if (model.settings.geo) {
          schema.index({ [model.settings.geo]: '2dsphere' });
        }
      }
      schemas[name] = mongoose.model(name, schema);
    }
    fastify.decorate('mongodb', schemas);
    fastify.addHook('onClose', async (instance, done) => {
      await mongoose.disconnect();
      done();
    });
    fastify.log.info('database mongo connected');
  } catch (err) {
    fastify.log.error(err);
  }
};

module.exports = fp(mongoPlugin, {
  fastify: '5.x',
});
