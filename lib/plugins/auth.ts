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
    fastify.assert(match, 400, 'Invalid Authorization header');

    let isValid = false;
    let token: AuthToken | undefined;
    try {
      const id = Buffer.from(match[1], 'base64');
      const plaintext = Buffer.from(match[2], 'base64');

      token = await fastify.db.loadAuthToken(id);
      if (!token) {
        return reply.forbidden('Incorrect token');
      }

      isValid = await token.authenticate(plaintext);
    } catch (error) {
      return reply.badRequest('Bad token');
    }

    if (!isValid) {
      return reply.forbidden('Incorrect token');
    }

    request.user = await fastify.db.loadUser(token.username);
    if (!request.user) {
      return reply.forbidden('Incorrect token');
    }

    return undefined;
  });
}

export default FastifyPlugin(auth);
