import assert from 'assert';
import { Router } from 'express';
import createDebug from 'debug';

import { compact } from '../util/jsonld.js';
import verifySignature from '../middlewares/verify-signature.js';
import { wrap } from '../middlewares/wrap';
import type { Database } from '../db.js';
import type { Inbox } from '../inbox.js';
import { paginate } from './util.js';

const debug = createDebug('me:routes:users');

export default (db: Database, inbox: Inbox): Router => {
  const router = Router();

  router.param('user', wrap(async (req, res, next, name) => {
    req.user = await db.loadUser(name);

    if (!req.user) {
      res.status(404).send({ error: 'user not found' });
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
    const { user } = req;
    assert(user, 'Must have user');

    const url = user.getURL();

    res.type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url,
      type: 'Person',
      following: new URL('./following', url),
      followers: new URL('./followers', url),
      inbox: new URL('./inbox', url),
      outbox: new URL('./outbox', url),
      preferredUsername: user.username,
      name: user.profileName,
      summary: user.about,

      // TODO(indutny): shared inbox

      publicKey: {
        id: `${url}#main-key`,
        owner: url,
        publicKeyPem: user.publicKey,
      },
    });
  });

  router.get('/:user/outbox', (req, res) => {
    res.status(500).send({ error: 'not implemented' });
  });

  router.get('/:user/followers', wrap(async (req, res) => {
    const { user } = req;
    assert(user, 'Must have user');

    const userURL = user.getURL();

    await paginate(req, res, {
      url: new URL('./followers', userURL),
      summary: `${user.profileName}'s followers`,
      getData: (page) => db.getFollowers(userURL, page),
    });
  }));

  router.get('/:user/following', wrap(async (req, res) => {
    const { user } = req;
    assert(user, 'Must have user');

    const userURL = user.getURL();

    await paginate(req, res, {
      url: new URL('./following', userURL),
      summary: `${user.profileName}'s following`,
      getData: (page) => db.getFollowing(userURL, page),
    });
  }));

  router.post('/:user/inbox', wrap(async (req, res) => {
    if (!req.senderKey) {
      res.status(401).send({ error: 'Signature is required' });
      return;
    }

    const { user } = req;
    assert(user, 'Must have user');

    const { id, actor } = req.body;
    if (req.senderKey.owner !== actor) {
      res.status(403).send({ error: 'Signature does not match actor' });
      return;
    }

    // Can't squat others ids!
    if (id && new URL(id).origin !== new URL(actor).origin) {
      debug('invalid activity id=%j actor=%j', id, req.body.actor);
      res.status(400).send({ error: 'Invalid activity id' });
      return;
    }

    try {
      await inbox.handleActivity(user, req.body)
      res.status(202).send();
    } catch (error) {
      debug('failed to handle activity %j %j', req.body, error.stack);
      res.status(500).send({ error: error.message });
    }
  }));

  return router;
};
