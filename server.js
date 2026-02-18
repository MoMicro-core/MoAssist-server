'use strict';
const { initFastify } = require('./init');

(async () => {
  const fastify = await initFastify();
  const { config } = fastify;

  await fastify.listen({
    port: config.environment.port,
    host: config.environment.host,
  });
  fastify.log.info(`API on port ${config.environment.port}`);
})();
