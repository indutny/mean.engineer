import type { FastifyInstance } from 'fastify';

import { compact } from '../util/jsonld.js';

export default async function jsonld(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser([
    'application/ld+json',
    'application/activity+json',
  ], { parseAs: 'string' }, async (_request: unknown, body: string) => {
    try {
      const json = JSON.parse(body);
      return compact(json);
    } catch (err) {
      err.statusCode = 400;
      throw err;
    }
  });
}
