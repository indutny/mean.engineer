import { type FastifyInstance } from 'fastify';

import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import activityPub from './activityPub.js';

export default async (fastify: FastifyInstance): Promise<void> => {
  fastify.register(mastodon);
  fastify.register(webfinger);
  fastify.register(activityPub);
};
