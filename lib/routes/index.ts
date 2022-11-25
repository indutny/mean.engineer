import cors from '@fastify/cors';

import type { Instance } from '../instance.js';
import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import activityPub from './activityPub.js';

export default async (fastify: Instance): Promise<void> => {
  fastify.register(cors);

  fastify.register(mastodon);
  fastify.register(webfinger);
  fastify.register(activityPub);
};
