import { BASE_URL, USER, USER_FULL_NAME } from '../config.js';

export default (app) => {
  // TODO(indutny): verify signature

  app.get('/users/:user', (req, res) => {
    const { accept } = req.headers;
    if (!accept.startsWith('application/activity+json')) {
      res.status(404).send('HTML interface not implemented');
      return;
    }

    if (user !== USER) {
      res.status(404).send({ error: 'user not found' });
      return;
    }

    res.type('application/activity+json').send({
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        {
          toot: 'http://joinmastodon.org/ns#',
        }
      ],
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
};
