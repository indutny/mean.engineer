import { BASE_URL, HOST } from '../config.js';

export default (app) => {
  app.get('/.well-known/host-meta', (req, res) => {
    res.type('application/xrd+xml; charset=utf-8').send([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">',
      '  <Link rel="lrdd" template="https://indieweb.social' +
        '/.well-known/webfinger?resource={uri}"/>',
      '</XRD>'
    ].join('\n'));
  });

  app.get('/.well-known/webfinger', (req, res) => {
    const { resource = '' } = req.query;
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

    res.send({
      subject: resource,
      aliases: [
        `${BASE_URL}/@${account}`,
        `${BASE_URL}/users/${account}`
      ],
      links: [
        {
          rel: 'http://webfinger.net/rel/profile-page',
          type: 'text/html',
          href: `${BASE_URL}/@${account}`,
        },
        {
          rel: 'self',
          type: 'application/activity+json',
          href: `${BASE_URL}/users/${account}`
        },
        {
          rel: 'http://ostatus.org/schema/1.0/subscribe',
          // TODO(indutny): support this
          template: `${BASE_URL}/authorize_interaction?uri={uri}`
        }
      ]
    });
  });

};
