import assert from 'assert';
import { createVerify } from 'crypto';
import LRU from 'lru-cache';
import type { Request, RequestHandler } from 'express';
import createDebug from 'debug';

import { compact } from '../util/jsonld.js';
import { USER_AGENT } from '../config.js';
import { wrap } from './wrap';

const debug = createDebug('me:verify-signature');

const MAX_AGE = 12 * 3600 * 1000;
const SKEW = 3600 * 1000;

declare global {
  namespace Express {
    interface Request {
      senderKey?: SenderKey;
    }
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

export class Verifier {
  private readonly cache: LRU<string, string>;

  constructor({
    cacheSize = 100,
    cacheTTL = 3600 * 1000,
  }: VerifySignatureOptions = {}) {
    this.cache = new LRU({ max: cacheSize, ttl: cacheTTL });
  }

  public async verify(req: Request): Promise<SenderKey | undefined> {
    const signatureString = req.get('signature');
    if (!signatureString) {
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
        return `${key}: ${req.method.toLowerCase()} ${req.originalUrl}`;
      }

      return `${key}: ${req.get(key) ?? ''}`;
    }).join('\n');

    // TODO(indutny): invidate cache on error and retry
    const publicKey = await this.getPublicKey(owner, id);

    const v = createVerify('RSA-SHA256');
    v.update(plaintext);
    if (!v.verify(publicKey, signature)) {
      throw new Error('Invalid signature');
    }

    const age = Date.now() - new Date(req.get('date') ?? Date.now()).getTime();
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

    const { publicKey } = ld as any;
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

export default function verifySignature(
  options?: VerifySignatureOptions,
): RequestHandler {
  const v = new Verifier();

  return wrap(async (req, res, next) => {
    try {
      req.senderKey = await v.verify(req);
    } catch (error) {
      debug('got verify error', error);
      res.status(400)
        .send({ error: 'Invalid signature', details: error.message });
      return;
    }

    next();
  });
}
