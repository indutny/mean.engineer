import { Router } from 'express';

import type { Inbox } from '../inbox.js';
import type { Database } from '../db.js';

import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import users from './users.js';

export type RoutesOptions = Readonly<{
  inbox: Inbox;
  db: Database;
}>;

export default ({ inbox, db }: RoutesOptions): Router => {
  const router = Router();

  router.use('/api/v1', mastodon());
  router.use('/.well-known', webfinger(db));
  router.use('/users', users(db, inbox));

  return router;
}
