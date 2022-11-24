import FastifyPlugin from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import sjson from 'secure-json-parse';

import { compact } from '../util/jsonld.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

async function jsonld(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser([
    'application/ld+json',
    'application/activity+json',
  ], { parseAs: 'buffer' }, async (request: FastifyRequest, body: Buffer) => {
    request.rawBody = body;

    try {
      const json = sjson.parse(body.toString());
      return compact(json);
    } catch (err) {
      err.statusCode = 400;
      throw err;
    }
  });
}

export default FastifyPlugin(jsonld);
