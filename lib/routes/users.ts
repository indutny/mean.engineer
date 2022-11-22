import assert from 'assert';
import { Router } from 'express';
import createDebug from 'debug';
import cors from 'cors';

import { compact } from '../util/jsonld.js';
import { paginateResponse } from '../util/paginateResponse.js';
import { isSameOrigin } from '../util/isSameOrigin.js';
import verifySignature from '../middlewares/verifySignature.js';
import { wrap } from '../middlewares/wrap.js';
import type { User } from '../models/user.js';
import type { Database } from '../db.js';
import type { Inbox } from '../inbox.js';
import type { Outbox } from '../outbox.js';

const debug = createDebug('me:routes:users');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      targetUser?: User;
    }
  }
}

export type UsersOptions = Readonly<{
  db: Database;
  inbox: Inbox;
  outbox: Outbox;
}>;

export default ({ db, inbox, outbox }: UsersOptions): Router => {
  const router = Router();

  router.use(cors());

  router.param('user', wrap(async (req, res, next, name) => {
    req.targetUser = await db.loadUser(name);

    if (!req.targetUser) {
      res.status(404).send({ error: 'target user not found' });
      return;
    }

    next();
  }));

  router.use(verifySignature());

  router.use((req, res, next) => {
    if (req.method === 'POST') {
      if (!req.is('application/activity+json')) {
        res.status(400).send({ error: 'Bad content-type' });
        return;
      }

      next();
      return;
    }

    if (req.method === 'GET') {
      if (req.accepts('text/html')) {
        res.status(404).send('HTML interface not implemented');
        return;
      }

      if (!req.accepts('application/activity+json')) {
        res.status(400).send('Invalid Accept header');
        return;
      }

      next();
      return;
    }

    next();
  });

  router.use(wrap(async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }

    req.body = await compact(req.body);
    next();
  }));

  router.get('/:user', (req, res) => {
    const { targetUser } = req;
    assert(targetUser, 'Must have targetUser');

    const url = targetUser.getURL();

    res.type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url,
      type: 'Person',
      following: `${url}/following`,
      followers: `${url}/followers`,
      inbox: `${url}/inbox`,
      outbox: `${url}/outbox`,
      preferredUsername: targetUser.username,
      name: targetUser.profileName,
      summary: targetUser.about,

      // TODO(indutny): shared inbox

      publicKey: {
        id: `${url}#main-key`,
        owner: url,
        publicKeyPem: targetUser.publicKey,
      },
    });
  });

  router.get('/:user/outbox', (req, res) => {
    res.status(500).send({ error: 'not implemented' });
  });

  router.post('/:user/outbox', wrap(async (req, res) => {
    const { user, targetUser } = req;
    assert(targetUser, 'Must have user');

    if (!user) {
      res.status(401).send({ error: 'not authorized' });
      return;
    }

    if (!user.isSame(targetUser)) {
      res.status(403).send({ error: 'invalid authorization' });
      return;
    }

    await outbox.sendActivity(user, req.body);

    res.status(201).send();
  }));

  router.get('/:user/followers', wrap(async (req, res) => {
    const { targetUser } = req;
    assert(targetUser, 'Must have user');

    const userURL = targetUser.getURL();

    await paginateResponse(req, res, {
      url: new URL(`${userURL}/followers`),
      summary: `${targetUser.profileName}'s followers`,
      getData: (page) => db.getPaginatedFollowers(userURL, page),
    });
  }));

  router.get('/:user/following', wrap(async (req, res) => {
    const { targetUser } = req;
    assert(targetUser, 'Must have targetUser');

    const userURL = targetUser.getURL();

    await paginateResponse(req, res, {
      url: new URL(`${userURL}/following`),
      summary: `${targetUser.profileName}'s following`,
      getData: (page) => db.getPaginatedFollowing(userURL, page),
    });
  }));

  router.post('/:user/inbox', wrap(async (req, res) => {
    if (!req.senderKey) {
      res.status(401).send({ error: 'Signature is required' });
      return;
    }

    const { targetUser } = req;
    assert(targetUser, 'Must have targetUser');

    type Body = Readonly<{
      id: string;
      actor: string;
    }>;

    const { id, actor } = req.body as Body;
    if (req.senderKey.owner !== actor) {
      res.status(403).send({ error: 'Signature does not match actor' });
      return;
    }

    // Can't squat others ids!
    if (id && isSameOrigin(new URL(id), new URL(actor))) {
      debug('invalid activity origin body=%O', req.body);
      res.status(400).send({ error: 'Invalid activity origin' });
      return;
    }

    try {
      await inbox.handleActivity(targetUser, req.body);
      res.status(202).send();
    } catch (error) {
      debug('failed to handle activity %j %O', req.body, error);
      res.status(500).send({ error: error.message });
    }
  }));

  return router;
};
