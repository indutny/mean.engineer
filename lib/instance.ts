import Fastify from 'fastify';
import FastifySensible from '@fastify/sensible';
import FastifyRateLimit from '@fastify/rate-limit';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import routes from './routes/index.js';
import jsonld from './plugins/jsonld.js';
import { MINUTE } from './constants.js';

export type Instance = Awaited<ReturnType<typeof create>>;

export default async function create() {
  const fastify = Fastify({
    logger: {
      transport: { target: '@fastify/one-line-logger' },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.register(FastifySensible);
  fastify.register(FastifyRateLimit, {
    max: 120,
    timeWindow: MINUTE,
    hook: 'preHandler',
    async keyGenerator(request) {
      if (!request.senderKey) {
        return request.headers['x-forwarded-for'] ?? request.ip;
      }

      const url = new URL(request.senderKey.owner);
      url.search = '';
      return url.toString();
    }
  });
  fastify.register(jsonld);
  fastify.register(routes);

  return fastify;
}
