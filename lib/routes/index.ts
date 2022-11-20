import { Router } from 'express';

import type { Inbox } from '../inbox.js';
import type { User, Database } from '../db.js';

import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import users from './users.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export type RoutesOptions = Readonly<{
  inbox: Inbox;
  db: Database;
}>;

export default ({ inbox, db }: RoutesOptions): Router => {
  const router = Router();

  // TODO(indutny): verify signature
  router.param('user', (req, res, next, name) => {
    req.user = db.getUser(name);

    if (!req.user) {
      res.status(404).send({ error: 'user not found' });
      return;
    }

    next();
  });

  router.use('/api/v1', mastodon());
  router.use('/.well-known', webfinger());
  router.use('/users', users(inbox));

  return router;
}
