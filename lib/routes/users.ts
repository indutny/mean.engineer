import assert from 'assert';
import { Router } from 'express';
import createDebug from 'debug';

import { compact } from '../jsonld.js';
import verifySignature from '../middlewares/verify-signature.js';
import type { Database } from '../db.js';
import type { Inbox } from '../inbox.js';
import { getLocalUserURL } from '../util.js';
import { paginate } from './util.js';

const debug = createDebug('me:routes:users');

export default (db: Database, inbox: Inbox): Router => {
  const router = Router();

  router.param('user', (req, res, next, name) => {
    req.user = db.getUser(name);

    if (!req.user) {
      res.status(404).send({ error: 'user not found' });
      return;
    }

    next();
  });

  router.use(verifySignature());

  router.use(async (req, res, next) => {
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

  router.use(async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }

    try {
      req.body = await compact(req.body);
    } catch (error) {
      debug('Failed to compact JSON-LD', error);
      res.status(400).send({ error: 'Bad input' });
      return;
    }
    next();
  });

  router.get('/:user', (req, res) => {
    const { user } = req;
    assert(user, 'Must have user');

    const url = getLocalUserURL(user);

    res.type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url,
      type: 'Person',
      following: `${url}/following`,
      followers: `${url}/followers`,
      inbox: `${url}/inbox`,
      outbox: `${url}/outbox`,
      preferredUsername: user.name,
      name: user.profileName,
      summary: user.summary,

      publicKey: {
        id: `${url}#main-key`,
        owner: url,
        publicKeyPem: user.publicKey,
      },
    });
  });

  router.get('/:user/outbox', async (req, res) => {
    res.status(500).send({ error: 'not implemented' });
  });

  router.get('/:user/followers', async (req, res) => {
    const { user } = req;
    assert(user, 'Must have user');

    paginate(req, res, {
      url: `${getLocalUserURL(user)}/followers`,
      summary: `${user.profileName}'s followers`,
      getData: (page) => db.getFollowers(user.name, page),
    });
  });

  router.get('/:user/following', async (req, res) => {
    const { user } = req;
    assert(user, 'Must have user');

    paginate(req, res, {
      url: `${getLocalUserURL(user)}/following`,
      summary: `${user.profileName}'s following`,
      getData: (page) => db.getFollowing(user.name, page),
    });
  });

  router.post('/:user/inbox', async (req, res) => {
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
  });

  return router;
};
