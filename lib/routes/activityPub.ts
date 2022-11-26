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
import {
  ActorSchema,
  ActivityValidator,
  UnknownObjectValidator,
  getLinkURL,
} from '../schemas/activityPub.js';
import type { Instance } from '../instance.js';

const debug = createDebug('me:routes:users');

declare module 'fastify' {
  interface FastifyRequest {
    targetUser?: User;
  }
}

export default async (fastify: Instance): Promise<void> => {
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

  fastify.get('/users/:user', {
    schema: {
      response: {
        200: ActorSchema,
      },
    }
  }, (request) => {
    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    const url = targetUser.getURL();

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url.toString(),
      type: 'Person' as const,
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
        owner: url.toString(),
        publicKeyPem: targetUser.publicKey,
      },
    };
  });

  fastify.get<{
    Querystring: { page?: string };
    Reply: PaginateReply;
  }>('/users/:user/outbox', (request, reply) => {
    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    const userURL = targetUser.getURL();

    return paginateResponse(request, reply, {
      url: new URL(`${userURL}/outbox`),
      summary: `${targetUser.profileName}'s timeline`,
      getData: (page) => fastify.db.getPaginatedTimeline(userURL, page),
    });
  });

  fastify.post('/users/:user/outbox', async (request, reply) => {
    const { user, targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    if (!user) {
      return reply.unauthorized();
    }

    if (!user.isSame(targetUser)) {
      return reply.forbidden('invalid authorization');
    }

    let result: URL;
    if (ActivityValidator.Check(request.body)) {
      result = await fastify.outbox.sendActivity(user, request.body);
    } else if (UnknownObjectValidator.Check(request.body)) {
      result = await fastify.outbox.sendObject(user, request.body);
    } else {
      debug('unsupported outbox activity origin body=%O', request.body);
      result = user.createTemporaryId();
    }
    return reply.redirect(201, result.toString());
  });

  // TODO(indutny): use schema
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

  // TODO(indutny): use schema
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

  fastify.get<{
    Querystring: { page?: string };
    Reply: PaginateReply;
  }>('/users/:user/inbox', async (request, reply) => {
    const { user, targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    if (!user) {
      return reply.unauthorized();
    }

    if (!user.isSame(targetUser)) {
      return reply.forbidden('invalid authorization');
    }

    const userURL = user.getURL();

    return paginateResponse(request, reply, {
      url: new URL(`${userURL}/inbox`),
      summary: `${user.profileName}'s inbox`,
      getData: (page) => fastify.db.getPaginatedInbox(userURL, page),
    });
  });

  fastify.post('/users/:user/inbox', async (request, reply) => {
    if (!request.senderKey) {
      return reply.unauthorized('Signature header is required');
    }

    const { targetUser } = request;
    fastify.assert(targetUser, 400, 'Missing target user');

    if (!ActivityValidator.Check(request.body)) {
      debug('unsupported inbox activity origin body=%O', request.body);
      return reply.notImplemented('Activity not supported');
    }

    const actor = getLinkURL(request.body.actor);
    if (request.senderKey.owner !== actor.toString()) {
      return reply.forbidden('Signature does not match actor');
    }

    // Can't squat others ids!
    if (!isSameHost(getLinkURL(request.body), actor)) {
      debug('invalid activity origin body=%O', request.body);
      return reply.forbidden('Invalid activity origin');
    }

    try {
      await fastify.inbox.handleActivity(targetUser, request.body);
      debug('successfully handled activity %j', request.body);
      return reply.status(202).send();
    } catch (error) {
      debug('failed to handle activity %j %O', request.body, error);
      return reply.internalServerError(error.stack);
    }
  });
};
