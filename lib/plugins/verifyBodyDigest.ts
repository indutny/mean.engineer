import FastifyPlugin from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import assert from 'assert';
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
    if (rawBody === undefined) {
      reply.status(400).send({ error: 'Missing body for digest header' });
      return reply;
    }

    const match = digest.match(/^([^=]*)=(.*)$/);
    assert(match, 'Invalid digest header');

    const [, algorithm, expectedBase64] = match;
    assert.strictEqual(
      algorithm.toLowerCase(),
      'sha-256',
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
      reply.status(400).send({ error: 'Invalid body digest' });
      return reply;
    }

    return undefined;
  });
}

export default FastifyPlugin(verifyBodyDigest);
