import FastifyPlugin from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import assert from 'assert';
import { createVerify } from 'crypto';
import LRU from 'lru-cache';
import createDebug from 'debug';

import { compact } from '../util/jsonld.js';
import { USER_AGENT } from '../config.js';
import { HOUR } from '../constants.js';
import { ActorValidator } from '../schemas/activityPub.js';
import type { Instance } from '../instance.js';

const debug = createDebug('me:verifySignatureHeader');

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

  constructor(private readonly fastify: Instance, {
    cacheSize = 100,
    cacheTTL = HOUR,
  }: VerifySignatureOptions = {}) {
    this.cache = new LRU({ max: cacheSize, ttl: cacheTTL });
  }

  public async verify(
    request: FastifyRequest<{ Headers: Headers }>,
  ): Promise<SenderKey | undefined> {
    const fastify: Instance = this.fastify;

    const { signature: signatureString } = request.headers;
    if (signatureString === undefined) {
      return undefined;
    }

    const keyMatch = signatureString.match(/keyId="([^"]*)#([^"]*)"/);
    fastify.assert(keyMatch, 400, 'Missing or invalid keyId');
    const algorithmMatch = signatureString.match(/algorithm="([^"]*)"/);
    fastify.assert(algorithmMatch, 400, 'Missing or invalid algorithm');
    const signatureMatch = signatureString.match(/signature="([^"]*)"/);
    fastify.assert(signatureMatch, 400, 'Missing or invalid signature');
    const headersMatch = signatureString.match(/headers="([^"]*)"/);
    fastify.assert(headersMatch, 400, 'Missing or invalid headers');

    const [,owner,id] = keyMatch;
    const [,algorithm ] = algorithmMatch;
    const [,signatureBase64] = signatureMatch;
    const headers = headersMatch[1].split(' ');

    fastify.assert(
      algorithm === 'rsa-sha256',
      400,
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
    fastify.assert(v.verify(publicKey, signature), 400, 'Invalid signature');

    const age = Date.now() - new Date(
      request.headers.date ?? Date.now()
    ).getTime();
    fastify.assert(age <= MAX_AGE + SKEW, 400, 'Request is too old');

    return { owner, id };
  }

  private async getPublicKey(owner: string, id: string): Promise<string> {
    const fastify: Instance = this.fastify;
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
    const actor = await compact(json);
    debug('got remote actor %O', actor);
    assert(ActorValidator.Check(actor), 'Remote object is not a valid actor');

    const { publicKey } = actor;
    fastify.assert(publicKey, 404, 'Remote did not return public key');

    const publicKeys = Array.isArray(publicKey) ? publicKey : [publicKey];

    const key = publicKeys.find((remoteKey) => {
      return remoteKey?.id === fullId && remoteKey?.owner === owner;
    });
    fastify.assert(key, 404, 'Remote does not have desired public key');

    const { publicKeyPem } = key;
    fastify.assert(
      typeof publicKeyPem === 'string',
      404,
      'Missing remote public key PEM',
    );

    this.cache.set(fullId, publicKeyPem);

    return publicKeyPem;
  }
}

async function verifySignatureHeader(
  fastify: Instance,
  options?: VerifySignatureOptions,
): Promise<void> {
  const v = new Verifier(fastify, options);

  fastify.addHook<{
    Headers: Headers;
  }>('preValidation', async (request) => {
    request.senderKey = await v.verify(request);
  });
}

export default FastifyPlugin(verifySignatureHeader);
