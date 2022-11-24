import FastifyPlugin from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import assert from 'assert';
import { createVerify } from 'crypto';
import LRU from 'lru-cache';
import createDebug from 'debug';

import { compact } from '../util/jsonld.js';
import { USER_AGENT } from '../config.js';
import { HOUR } from '../constants.js';

const debug = createDebug('me:verify-signature');

const MAX_AGE = 12 * HOUR;
const SKEW = HOUR;

declare module 'fastify' {
  interface FastifyRequest {
    senderKey?: SenderKey;
  }
  interface FastifyReply {
    myPluginProp: number
  }
}

export type SenderKey = Readonly<{
  owner: string;
  id: string;
}>;

export type VerifySignatureOptions = Readonly<{
  cacheSize?: number;
  cacheTTL?: number;
}>;

interface Headers extends Record<string, string | undefined> {
  signature?: string;
  date?: string;
}

export class Verifier {
  private readonly cache: LRU<string, string>;

  constructor({
    cacheSize = 100,
    cacheTTL = HOUR,
  }: VerifySignatureOptions = {}) {
    this.cache = new LRU({ max: cacheSize, ttl: cacheTTL });
  }

  public async verify(
    request: FastifyRequest<{ Headers: Headers }>,
  ): Promise<SenderKey | undefined> {
    const { signature: signatureString } = request.headers;
    if (signatureString === undefined) {
      return undefined;
    }

    const keyMatch = signatureString.match(/keyId="([^"]*)#([^"]*)"/);
    assert(keyMatch, 'Missing or invalid keyId');
    const algorithmMatch = signatureString.match(/algorithm="([^"]*)"/);
    assert(algorithmMatch, 'Missing or invalid algorithm');
    const signatureMatch = signatureString.match(/signature="([^"]*)"/);
    assert(signatureMatch, 'Missing or invalid signature');
    const headersMatch = signatureString.match(/headers="([^"]*)"/);
    assert(headersMatch, 'Missing or invalid headers');

    const [,owner,id] = keyMatch;
    const [,algorithm ] = algorithmMatch;
    const [,signatureBase64] = signatureMatch;
    const headers = headersMatch[1].split(' ');

    assert.strictEqual(
      algorithm,
      'rsa-sha256',
      'Unsupported signature algorithm',
    );

    const signature = Buffer.from(signatureBase64, 'base64');

    const plaintext = headers.map((key) => {
      if (key === '(request-target)') {
        return `${key}: ${request.method.toLowerCase()} ${request.url}`;
      }

      return `${key}: ${request.headers[key] ?? ''}`;
    }).join('\n');

    // TODO(indutny): invidate cache on error and retry
    const publicKey = await this.getPublicKey(owner, id);

    const v = createVerify('RSA-SHA256');
    v.update(plaintext);
    if (!v.verify(publicKey, signature)) {
      throw new Error('Invalid signature');
    }

    const age = Date.now() - new Date(
      request.headers.date ?? Date.now()
    ).getTime();
    if (age > MAX_AGE + SKEW) {
      throw new Error('Request is too old');
    }

    return { owner, id };
  }

  private async getPublicKey(owner: string, id: string): Promise<string> {
    const fullId = `${owner}#${id}`;

    const cached = this.cache.get(fullId);
    if (cached) {
      return cached;
    }

    // TODO(indutny): blocklist
    const response = await fetch(owner, {
      headers: {
        accept: 'application/activity+json',
        'user-agent': USER_AGENT,
      },
    });

    const json = await response.json();
    const ld = await compact(json);

    type LD = Readonly<{ publicKey: string | ReadonlyArray<string> }>;

    const { publicKey } = ld as LD;
    assert(publicKey, 'Remote did not return public key');

    const publicKeys = Array.isArray(publicKey) ? publicKey : [publicKey];

    const key = publicKeys.find((remoteKey) => {
      return remoteKey?.id === fullId && remoteKey?.owner === owner;
    });
    assert(key, 'Remote does not have desired public key');

    const { publicKeyPem } = key;
    assert.strictEqual(typeof publicKeyPem, 'string', 'Missing public key PEM');

    this.cache.set(fullId, publicKeyPem);

    return publicKeyPem;
  }
}

async function verifySignatureHeader(
  fastify: FastifyInstance,
  options?: VerifySignatureOptions,
): Promise<void> {
  const v = new Verifier(options);

  fastify.addHook<{
    Headers: Headers;
  }>('preValidation', async (request, reply) => {
    try {
      request.senderKey = await v.verify(request);
    } catch (error) {
      debug('got verify error', error);
      reply.status(400)
        .send({ error: 'Invalid signature', details: error.message });
      return reply;
    }

    return undefined;
  });
}

export default FastifyPlugin(verifySignatureHeader);
