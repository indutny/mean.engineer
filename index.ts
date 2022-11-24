import Fastify from 'fastify';

import { Database } from './lib/db.js';
import { Inbox } from './lib/inbox.js';
import { Outbox } from './lib/outbox.js';

import routes from './lib/routes/index.js';
import jsonld from './lib/plugins/jsonld.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    outbox: Outbox;
    inbox: Inbox;
  }
}

const fastify = Fastify({
  logger: {
    transport: { target: '@fastify/one-line-logger' },
  },
});

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

fastify.register(jsonld);
fastify.register(routes);

await outbox.runJobs();

await fastify.listen({ port: 8000, host: '127.0.0.1' });
