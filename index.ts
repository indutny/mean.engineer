import express from 'express';
import fs from 'fs';

import { Database } from './lib/db.js';
import { Inbox } from './lib/inbox.js';
import { Outbox } from './lib/outbox.js';
import routes from './lib/routes/index.js';
import { bodyVerifier } from './lib/util/body-verifier.js';

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

app.all('*', function (req, res, next) {
  console.log(req.method, req.headers, req.url, req.body);
  next();
});

app.use(routes({ inbox, db }));

app.listen(8000, '127.0.0.1');

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
