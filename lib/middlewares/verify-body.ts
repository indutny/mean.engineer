import assert from 'assert';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import createDebug from 'debug';

const debug = createDebug('me:verifyBody');

export function verifyBody(req: Request, res: Response, body: Buffer): void {
  const digest = req.get('digest');
  if (!digest) {
    return;
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
  h.update(body);

  const actual = h.digest();
  if (!timingSafeEqual(actual, expected)) {
    debug(
      'body digest error actual=%j expected=%j',
      actual.toString('base64'),
      expected.toString('base64'),
    );
    throw new Error('Invalid digest');
  }
}
