import FastifyPlugin from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

import { type AuthToken } from '../models/authToken.js';
import { User } from '../models/user.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

async function auth(fastify: FastifyInstance): Promise<void> {
  fastify.addHook<{
    Headers: { authorization: 'string' };
  }>('onRequest', async (request, reply) => {
    const { authorization } = request.headers;
    if (!authorization) {
      return undefined;
    }

    const match = authorization.match(/^Bearer\s+([^\s]*):([^\s]*)$/i);
    if (!match) {
      reply.status(400).send({ error: 'Invalid Authorization header' });
      return reply;
    }

    let isValid = false;
    let token: AuthToken | undefined;
    try {
      const id = Buffer.from(match[1], 'base64');
      const plaintext = Buffer.from(match[2], 'base64');

      token = await fastify.db.loadAuthToken(id);
      if (!token) {
        reply.status(403).send({ error: 'Incorrect token' });
        return reply;
      }

      isValid = await token.authenticate(plaintext);
    } catch (error) {
      reply.status(400).send({ error: 'Bad token' });
      return reply;
    }

    if (!isValid) {
      reply.status(403).send({ error: 'Incorrect token' });
      return reply;
    }

    request.user = await fastify.db.loadUser(token.username);
    if (!request.user) {
      reply.status(403).send({ error: 'Incorrect token' });
      return reply;
    }

    return undefined;
  });
}

export default FastifyPlugin(auth);
