import Fastify from 'fastify';
import FastifySensible from '@fastify/sensible';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import { Database } from './db.js';
import { Inbox } from './inbox.js';
import { Outbox } from './outbox.js';
import routes from './routes/index.js';
import jsonld from './plugins/jsonld.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    outbox: Outbox;
    inbox: Inbox;
  }
}

export type Instance = Awaited<ReturnType<typeof create>>;

export default async function create() {
  const fastify = Fastify({
    logger: {
      transport: { target: '@fastify/one-line-logger' },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  const db = new Database();
  const outbox = new Outbox({ db });
  const inbox = new Inbox({ db, outbox });

  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });

  fastify
    .decorate('db', db)
    .decorate('outbox', outbox)
    .decorate('inbox', inbox);

  fastify.register(FastifySensible);
  fastify.register(jsonld);
  fastify.register(routes);

  await outbox.runJobs();

  return fastify;
}
