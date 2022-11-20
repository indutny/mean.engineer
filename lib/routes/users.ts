import assert from 'assert';
import { Router } from 'express';
import createDebug from 'debug';

import { BASE_URL } from '../config.js';
import { compact } from '../jsonld.js';
import verifySignature from '../middlewares/verify-signature.js';
import type { Inbox } from '../inbox.js';

const debug = createDebug('me:routes:users');

export default (inbox: Inbox): Router => {
  const router = Router();

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
      id: `${BASE_URL}/users/${user}`,
      type: 'Person',
      following: `${BASE_URL}/users/${user}/following`,
      followers: `${BASE_URL}/users/${user}/followers`,
      inbox: `${BASE_URL}/users/${user}/inbox`,
      outbox: `${BASE_URL}/users/${user}/outbox`,
      preferredUsername: user,
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

    const { user } = req.params;
    if (req.senderKey.owner !== req.body?.actor) {
      res.status(403).send({ error: 'Signature does not match actor' });
      return;
    }

    try {
      await inbox.handleActivity(user, req.body)
      res.status(202).type('application/activity+json').send();
    } catch (error) {
      res.status(500).send({ error: 'oops' });
    }
  });

  return router;
};
