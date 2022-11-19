import type { Application } from 'express';

import { BASE_URL, USER, USER_FULL_NAME } from '../config.js';
import { compact } from '../jsonld.js';

export default (app: Application): void => {
  // TODO(indutny): verify signature
  app.param('user', (req, res, next, user) => {
    if (user !== USER) {
      res.status(404).send({ error: 'user not found' });
      return;
    }

    next();
  });

  app.get('/users/:user', (req, res) => {
    const { accept } = req.headers;
    if (!accept?.startsWith('application/activity+json')) {
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

  app.post('/users/:user/inbox', async (req, res) => {
    const { 'content-type': contentType } = req.headers;
    if (!contentType?.startsWith('application/activity+json')) {
      res.status(404).send('HTML interface not implemented');
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
    console.log(body);

    res.status(500).send({ error: 'oops' });
  });
};
