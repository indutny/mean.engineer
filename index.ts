import createInstance from './lib/instance.js';
import { Database } from './lib/db.js';
import { Inbox } from './lib/inbox.js';
import { Outbox } from './lib/outbox.js';
import { ProfileFetcher } from './lib/profileFetcher.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    outbox: Outbox;
    inbox: Inbox;
    profileFetcher: ProfileFetcher;
  }
}

const fastify = await createInstance();

const db = new Database();
const outbox = new Outbox({ fastify, db });
const inbox = new Inbox({ db, outbox });
const profileFetcher = new ProfileFetcher(fastify);

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

fastify
  .decorate('db', db)
  .decorate('outbox', outbox)
  .decorate('inbox', inbox)
  .decorate('profileFetcher', profileFetcher);

await outbox.runJobs();

await fastify.listen({ port: 8000, host: '127.0.0.1' });
