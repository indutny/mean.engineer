import { Router } from 'express';

import { BASE_URL, HOST } from '../config.js';
import type { Database } from '../db.js';
import { wrap } from '../middlewares/wrap';

export default (db: Database): Router => {
  const router = Router();

  router.get('/host-meta', (req, res) => {
    res.type('application/xrd+xml; charset=utf-8').send([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">',
      `  <Link rel="lrdd" template="${BASE_URL}` +
        '/.well-known/webfinger?resource={uri}"/>',
      '</XRD>'
    ].join('\n'));
  });

  router.get('/webfinger', wrap(async (req, res) => {
    const { resource } = req.query;
    if (typeof resource !== 'string') {
      res.status(400).send({ error: 'Invalid or missing resource query' });
      return;
    }

    const accountMatch = resource.match(/^acct:(.*)@(.*)$/);
    if (!accountMatch) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    const [, account, accountHost] = accountMatch;
    if (accountHost !== HOST) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    const user = await db.loadUser(account);
    if (!user) {
      res.status(404).send({ error: 'User not found' });
      return;
    }

    const accountUrl = new URL(`./@${user.username}`, BASE_URL);
    const url = user.getURL();

    res.send({
      subject: resource,
      aliases: [
        accountUrl,
        url,
      ],
      links: [
        {
          rel: 'http://webfinger.net/rel/profile-page',
          type: 'text/html',
          href: accountUrl,
        },
        {
          rel: 'self',
          type: 'application/activity+json',
          href: url,
        },
        {
          rel: 'http://ostatus.org/schema/1.0/subscribe',
          // TODO(indutny): support this
          template: new URL(`./authorize_interaction?uri={uri}`, BASE_URL),
        }
      ]
    });
  }));

  return router;
};
