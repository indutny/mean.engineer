import createInstance from './lib/instance.js';

const fastify = await createInstance();

await fastify.listen({ port: 8000, host: '127.0.0.1' });
