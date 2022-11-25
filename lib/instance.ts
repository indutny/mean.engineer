import Fastify from 'fastify';
import FastifySensible from '@fastify/sensible';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import routes from './routes/index.js';
import jsonld from './plugins/jsonld.js';

export type Instance = Awaited<ReturnType<typeof create>>;

export default async function create() {
  const fastify = Fastify({
    logger: {
      transport: { target: '@fastify/one-line-logger' },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.register(FastifySensible);
  fastify.register(jsonld);
  fastify.register(routes);

  return fastify;
}
