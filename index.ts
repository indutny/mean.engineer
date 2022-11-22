import express from 'express';
import morgan from 'morgan';

import { Database } from './lib/db.js';
import { Inbox } from './lib/inbox.js';
import { Outbox } from './lib/outbox.js';
import routes from './lib/routes/index.js';
import { bodyVerifier } from './lib/util/body-verifier.js';
import { auth } from './lib/middlewares/auth.js';

const db = new Database();

const app = express();

const outbox = new Outbox({
  db,
});

const inbox = new Inbox({
  db,
  outbox,
});

app.use(express.json({
  type: ['application/json', 'application/activity+json'],
  verify: bodyVerifier,
}));
app.use(express.urlencoded({ extended: false, verify: bodyVerifier }));
app.use(auth(db));

app.use(morgan('tiny'));

app.use(routes({ inbox, outbox, db }));

await outbox.runJobs();

const server = app.listen(8000, '127.0.0.1', () => {
  console.log('Listening on', server.address());
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
