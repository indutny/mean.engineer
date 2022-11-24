import FastifyPlugin from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'crypto';
import createDebug from 'debug';

const debug = createDebug('me:bodyVerifier');

async function verifyBodyDigest(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.addHook<{
    Headers: { digest?: string };
  }>('preValidation', async (request, reply) => {
    const { digest } = request.headers;
    if (digest === undefined) {
      return;
    }

    const { rawBody } = request;
    fastify.assert(rawBody, 400, 'Missing body for Digest header');

    const match = digest.match(/^([^=]*)=(.*)$/);
    fastify.assert(match, 400, 'Invalid digest header');

    const [, algorithm, expectedBase64] = match;
    fastify.assert(
      algorithm.toLowerCase() === 'sha-256',
      400,
      'Only SHA-256 body digest is supported',
    );

    const expected = Buffer.from(expectedBase64, 'base64');

    const h = createHash('sha256');
    h.update(rawBody);

    const actual = h.digest();
    if (!timingSafeEqual(actual, expected)) {
      debug(
        'body digest error actual=%j expected=%j',
        actual.toString('base64'),
        expected.toString('base64'),
      );
      return reply.badRequest('Invalid body digest');
    }

    return undefined;
  });
}

export default FastifyPlugin(verifyBodyDigest);
