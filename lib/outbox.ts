import assert from 'assert';
import LRU from 'lru-cache';
import { createHash, createSign, randomUUID } from 'crypto';
import createDebug from 'debug';

import { USER_AGENT, BASE_URL } from './config.js';
import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { Activity } from './types/as.d';
import { compact } from './util/jsonld.js';

const debug = createDebug('me:outbox');

export type OutboxOptions = Readonly<{
  db: Database;
  cacheSize?: number;
  cacheTTL?: number;
}>;

export class Outbox {
  private readonly db: Database;
  private readonly inboxCache: LRU<string, string>;

  constructor({
    db,
    cacheSize = 100,
    cacheTTL = 3600 * 1000,
  }: OutboxOptions) {
    this.db = db;
    this.inboxCache = new LRU({
      max: cacheSize,
      ttl: cacheTTL,
    });
  }

  public async acceptFollow(user: User, follow: Activity): Promise<void> {
    const us = user.getURL();
    const body = {
      id: `${BASE_URL}/${randomUUID()}`,
      type: 'Accept',
      actor: us,
      object: follow,
    };

    const target = new URL(follow.actor);

    debug(`accepting follow ${us} <- ${target}`);
    await this.send(user, target, body);
    debug(`accepted follow ${us} <- ${target}`);
  }

  //
  // Private
  //

  private async send(
    user: User,
    target: URL,
    body: Record<string, unknown>,
  ): Promise<void> {
    const json = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...body,
    });

    const inbox = await this.getInbox(target);

    const digest = createHash('sha256').update(json).digest('base64');
    const date = new Date().toUTCString();
    const { host } = new URL(target);

    const inboxURL = new URL(inbox);

    const plaintext = [
      `(request-target): post ${inboxURL.pathname}${inboxURL.search}`,
      `host: ${host}`,
      `date: ${date}`,
      `digest: sha-256=${digest}`,
      'content-type: application/activity+json'
    ].join('\n');

    const signature = createSign('RSA-SHA256')
      .update(plaintext)
      .sign(user.privateKey)
      .toString('base64');

    const keyId = `${user.getURL()}#main-key`;

    const headers = {
      date,
      host,
      digest: `sha-256=${digest}`,
      'content-type': 'application/activity+json',
      'user-agent': USER_AGENT,
      'signature': [
        `keyId="${keyId}"`,
        'algorithm="rsa-sha256"',
        'headers="(request-target) host date digest content-type"',
        `signature="${signature}"`,
      ].join(','),
    };

    debug(
      'making outgoing request to %j plaintext=%j headers=%j',
      inbox,
      plaintext,
      headers,
    );

    // TODO(indutny): invalidate cache on failure and retry?
    const res = await fetch(inbox, {
      method: 'POST',
      headers,
      body: json,
    });
    debug('got response', res.status, res.headers);
    if (res.status < 200 || res.status >= 300) {
      const reason = await res.text();
      throw new Error(
        `Failed to post to inbox: ${inbox}, status: ${res.status}, ` +
          `reason: ${reason}`
      );
    }
  }

  private async getInbox(target: URL): Promise<string> {
    const cacheKey = target.toString();
    const cached = this.inboxCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const res = await fetch(target, {
      headers: {
        'accept': 'application/activity+json',
        'user-agent': USER_AGENT,
      },
    });

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { type, inbox } = (await compact(json)) as any;
    assert.strictEqual(type, 'Person', 'Invalid actor type');
    assert.strictEqual(typeof inbox, 'string', 'Missing inbox field');

    this.inboxCache.set(cacheKey, inbox);

    return inbox;
  }
}
