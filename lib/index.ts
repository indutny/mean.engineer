import express from 'express';
import fs from 'fs';

import { Database } from './db.js';
import { Inbox } from './inbox.js';
import { Outbox } from './outbox.js';
import routes from './routes/index.js';
import { verifyBody } from './middlewares/verify-body.js';

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
  verify: verifyBody,
}));
app.use(express.urlencoded({ extended: false, verify: verifyBody }));

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
