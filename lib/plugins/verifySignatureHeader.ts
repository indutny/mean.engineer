import FastifyPlugin from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { createVerify } from 'crypto';

import { HOUR } from '../constants.js';
import type { Instance } from '../instance.js';

const MAX_AGE = 12 * HOUR;
const SKEW = HOUR;

declare module 'fastify' {
  interface FastifyRequest {
    senderKey?: SenderKey;
  }
}

export type SenderKey = Readonly<{
  owner: string;
  id: string;
}>;

interface Headers extends Record<string, string | undefined> {
  signature?: string;
  date?: string;
}

export class Verifier {
  constructor(private readonly fastify: Instance) {
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

    const fullId = `${owner}#${id}`;

    return fastify.profileFetcher.withProfile(
      new URL(owner),
      async (profile) => {
        const { publicKey } = profile;
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

        const v = createVerify('RSA-SHA256');
        v.update(plaintext);
        fastify.assert(
          v.verify(publicKeyPem, signature),
          403,
          'Invalid signature',
        );

        const age = Date.now() - new Date(
          request.headers.date ?? Date.now()
        ).getTime();
        fastify.assert(age <= MAX_AGE + SKEW, 400, 'Request is too old');

        return { owner, id };
      },
    );
  }
}

async function verifySignatureHeader(
  fastify: Instance,
): Promise<void> {
  const v = new Verifier(fastify);

  fastify.addHook<{
    Headers: Headers;
  }>('preValidation', async (request) => {
    request.senderKey = await v.verify(request);
  });
}

export default FastifyPlugin(verifySignatureHeader);
