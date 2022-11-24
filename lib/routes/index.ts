import { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import activityPub from './activityPub.js';

export default async (fastify: FastifyInstance): Promise<void> => {
  fastify.register(cors);

  fastify.register(mastodon);
  fastify.register(webfinger);
  fastify.register(activityPub);
};
