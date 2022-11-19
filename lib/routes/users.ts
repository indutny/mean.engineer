import { Router } from 'express';

import { BASE_URL, USER, USER_FULL_NAME } from '../config.js';
import { compact } from '../jsonld.js';
import verifySignature from '../middlewares/verify-signature.js';

export default (): Router => {
  const router = Router();

  router.use(verifySignature());

  // TODO(indutny): verify signature
  router.param('user', (req, res, next, user) => {
    if (user !== USER) {
      res.status(404).send({ error: 'user not found' });
      return;
    }

    next();
  });

  router.get('/:user', (req, res) => {
    if (!req.accepts('application/activity+json')) {
      res.status(404).send('HTML interface not implemented');
      return;
    }

    const { user } = req.params;

    res.type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${BASE_URL}/users/${user}`,
      type: 'Person',
      following: `${BASE_URL}/users/${user}/following`,
      followers: `${BASE_URL}/users/${user}/followers`,
      inbox: `${BASE_URL}/users/${user}/inbox`,
      outbox: `${BASE_URL}/users/${user}/outbox`,
      preferredUsername: user,
      name: USER_FULL_NAME,

      // TODO(indutny): public key
    });
  });

  router.post('/:user/inbox', async (req, res) => {
    if (!req.is('application/activity+json')) {
      res.status(400).send({ error: 'Bad content-type' });
      return;
    }

    const { user } = req.params;

    let body: any;
    try {
      body = await compact(req.body);
    } catch (error) {
      res.status(400).send({ error: 'Bad input' });
      return;
    }

    const { type, id, actor, object } = body;

    if (type === 'Follow') {
      // TODO(indutny): respond with Accept
    }
    console.log(req.senderKey, body);

    res.status(500).send({ error: 'oops' });
  });

  return router;
};
