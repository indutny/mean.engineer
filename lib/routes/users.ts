import assert from 'assert';
import { Router } from 'express';
import createDebug from 'debug';

import { BASE_URL } from '../config.js';
import { compact } from '../jsonld.js';
import verifySignature from '../middlewares/verify-signature.js';
import type { Database } from '../db.js';
import type { Inbox } from '../inbox.js';

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
    if (req.accepts('text/html')) {
      res.status(404).send('HTML interface not implemented');
      return;
    }

    if (!req.accepts('application/activity+json')) {
      res.status(400).send('Invalid Accept header');
      return;
    }

    const { user } = req;
    assert(user, 'Must have user');

    res.type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${BASE_URL}/users/${user.name}`,
      type: 'Person',
      following: `${BASE_URL}/users/${user.name}/following`,
      followers: `${BASE_URL}/users/${user.name}/followers`,
      inbox: `${BASE_URL}/users/${user.name}/inbox`,
      outbox: `${BASE_URL}/users/${user.name}/outbox`,
      preferredUsername: user.name,
      name: user.profileName,
      summary: user.summary,

      publicKey: {
        id: `${BASE_URL}/users/${user.name}#main-key`,
        owner: `${BASE_URL}/users/${user.name}`,
        publicKeyPem: user.publicKey,
      },
    });
  });

  router.post('/:user/inbox', async (req, res) => {
    if (!req.is('application/activity+json')) {
      res.status(400).send({ error: 'Bad content-type' });
      return;
    }

    if (!req.senderKey) {
      res.status(401).send({ error: 'Signature is required' });
      return;
    }

    const { user } = req;
    assert(user, 'Must have user');

    if (req.senderKey.owner !== req.body?.actor) {
      res.status(403).send({ error: 'Signature does not match actor' });
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
