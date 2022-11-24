import { type FastifyInstance } from 'fastify';

import { BASE_URL, HOST } from '../config.js';

export default async (fastify: FastifyInstance): Promise<void> => {
  // TODO(indutny): add cors back

  fastify.get('/.well-known/host-meta', (request, reply) => {
    reply.type('application/xrd+xml; charset=utf-8').send([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">',
      `  <Link rel="lrdd" template="${BASE_URL}` +
        '/.well-known/webfinger?resource={uri}"/>',
      '</XRD>'
    ].join('\n'));
  });

  fastify.get<{
    Querystring: { resource?: string };
    // TODO(indutny): response schema
  }>('/.well-known/webfinger', async (request, reply) => {
    const { resource } = request.query;
    if (typeof resource !== 'string') {
      reply.status(400);
      return { error: 'Invalid or missing resource query' };
    }

    const accountMatch = resource.match(/^acct:(.*)@(.*)$/);
    if (!accountMatch) {
      reply.status(404);
      return { error: 'Invalid resource query' };
    }

    const [, account, accountHost] = accountMatch;
    if (accountHost !== HOST) {
      reply.status(404);
      return { error: 'Invalid account hostname' };
    }

    const user = await fastify.db.loadUser(account);
    if (!user) {
      reply.status(404);
      return { error: 'Local user not found' };
    }

    const accountUrl = new URL(`./@${user.username}`, BASE_URL);
    const url = user.getURL();

    return {
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
          template: new URL('./authorize_interaction?uri={uri}', BASE_URL),
        }
      ]
    };
  });
};
