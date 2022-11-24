import { type FastifyInstance } from 'fastify';
import acceptSerializer from '@fastify/accepts-serializer';
import createDebug from 'debug';

import auth from '../plugins/auth.js';
import verifyBodyDigest from '../plugins/verifyBodyDigest.js';
import verifySignatureHeader from '../plugins/verifySignatureHeader.js';
import {
  paginateResponse,
  type PaginateReply,
} from '../util/paginateResponse.js';
import { isSameHost } from '../util/isSameHost.js';
import type { User } from '../models/user.js';
import type { Activity } from '../types/as.js';

const debug = createDebug('me:routes:users');

declare module 'fastify' {
  interface FastifyRequest {
    targetUser?: User;
  }
}

export default async (fastify: FastifyInstance): Promise<void> => {
  // TODO(indutny): html serializer?
  fastify.register(acceptSerializer, {
    serializers: [{
      regex: /^application\/(ld|activity)\+json$/,
      serializer(body) {
        return JSON.stringify(body);
      }
    }],
    default: 'application/activity+json',
  });

  fastify.addHook<{
    Params: { user?: string }
  }>('preHandler', async (request, reply) => {
    if (!request.params.user) {
      return;
    }

    request.targetUser = await fastify.db.loadUser(request.params.user);

    if (!request.targetUser) {
      return reply.notFound('target user not found');
    }

    return undefined;
  });

  fastify.register(auth);
  fastify.register(verifyBodyDigest);
  fastify.register(verifySignatureHeader);

  // TODO(indutny): use @fastify/accepts-serializer

  fastify.get('/users/:user', (request) => {
    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    const url = targetUser.getURL();

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url,
      type: 'Person',
      following: `${url}/following`,
      followers: `${url}/followers`,
      inbox: `${url}/inbox`,
      outbox: `${url}/outbox`,
      preferredUsername: targetUser.username,
      name: targetUser.profileName,
      summary: targetUser.about,

      // TODO(indutny): shared inbox

      publicKey: {
        id: `${url}#main-key`,
        owner: url,
        publicKeyPem: targetUser.publicKey,
      },
    };
  });

  fastify.get('/users/:user/outbox', (request, reply) => {
    return reply.internalServerError('not implemented');
  });

  fastify.post<{
    // TODO(indutny): schema
    Body: Activity;
  }>('/users/:user/outbox', async (request, reply) => {
    const { user, targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    if (!user) {
      return reply.unauthorized();
    }

    if (!user.isSame(targetUser)) {
      return reply.forbidden('invalid authorization');
    }

    await fastify.outbox.sendActivity(user, request.body);

    return reply.status(201);
  });

  fastify.get<{
    Querystring: { page?: string };
    Reply: PaginateReply;
  }>('/users/:user/followers', async (request, reply) => {
    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    const userURL = targetUser.getURL();

    return paginateResponse(request, reply, {
      url: new URL(`${userURL}/followers`),
      summary: `${targetUser.profileName}'s followers`,
      getData: (page) => fastify.db.getPaginatedFollowers(userURL, page),
    });
  });

  fastify.get<{
    Querystring: { page?: string };
    Reply: PaginateReply;
  }>('/users/:user/following', async (request, reply) => {
    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    const userURL = targetUser.getURL();

    return paginateResponse(request, reply, {
      url: new URL(`${userURL}/following`),
      summary: `${targetUser.profileName}'s following`,
      getData: (page) => fastify.db.getPaginatedFollowing(userURL, page),
    });
  });

  fastify.get('/users/:user/inbox', async (request, reply) => {
    reply.internalServerError('not implemented');
  });

  fastify.post<{
    Body: Activity;
  }>('/users/:user/inbox', async (request, reply) => {
    if (!request.senderKey) {
      return reply.unauthorized('Signature header is required');
    }

    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    type Body = Readonly<{
      id: string;
      actor: string;
    }>;

    const { id, actor } = request.body as Body;
    if (request.senderKey.owner !== actor) {
      return reply.forbidden('Signature does not match actor');
    }

    // Can't squat others ids!
    if (id && !isSameHost(new URL(id), new URL(actor))) {
      debug('invalid activity origin body=%O', request.body);
      return reply.badRequest('Invalid activity origin');
    }

    try {
      await fastify.inbox.handleActivity(targetUser, request.body);
      return reply.status(202);
    } catch (error) {
      debug('failed to handle activity %j %O', request.body, error);
      return reply.internalServerError(error.stack);
    }
  });
};
