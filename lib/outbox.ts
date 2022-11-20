import assert from 'assert';
import LRU from 'lru-cache';
import { createHash, createSign, randomUUID } from 'crypto';
import createDebug from 'debug';

import { USER_AGENT, BASE_URL } from './config.js';
import type { User, Database } from './db.js';
import type { Activity } from './as.js';
import { compact } from './jsonld.js';

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
    cacheTTL = 3600,
  }: OutboxOptions) {
    this.db = db;
    this.inboxCache = new LRU({
      max: cacheSize,
      ttl: cacheTTL,
    });
  }

  public async acceptFollow(user: User, follow: Activity): Promise<void> {
    const body = {
      id: `${BASE_URL}/${randomUUID()}`,
      type: 'Accept',
      actor: `${BASE_URL}/users/${user.name}`,
      object: follow,
    };

    debug(`accepting follow ${user.name} <- ${follow.actor}`);
    await this.send(user, follow.actor, body);
    debug(`accepted follow ${user.name} <- ${follow.actor}`);
  }

  //
  // Private
  //

  private async send(
    user: User,
    target: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const json = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...body,
    });

    const inbox = await this.getInbox(target);

    const digest = createHash('sha256').update(json).digest('base64');
    const date = JSON.parse(JSON.stringify(new Date()));
    const { host } = new URL(target);

    const plaintext = [
      `(request-target): post ${inbox}`,
      `host: ${host}`,
      `date: ${date}`,
      `digest: ${digest}`,
      'content-type: application/activity+json'
    ].join('\n');

    const signature = createSign('RSA-SHA256')
      .update(plaintext)
      .sign(user.privateKey)
      .toString('base64');

    const headers = {
      date,
      host,
      digest: `sha-256=${digest}`,
      'content-type': 'application/activity+json',
      'user-agent': USER_AGENT,
      'signature': [
        `keyId="${BASE_URL}/users/${user.name}#main-key"`,
        'algorithm="rsa-sha256"',
        'headers="(request-target) host date digest content-type',
        `signature="${signature}"`,
      ].join(','),
    };

    console.error('===');
    console.error(plaintext);
    console.error(headers);
    console.error('===');

    const res = await fetch(inbox, {
      method: 'POST',
      headers,
      body: json,
    });
    if (res.status < 200 || res.status >= 300) {
      const reason = await res.text();
      throw new Error(
        `Failed to post to inbox: ${inbox}, status: ${res.status}, ` +
          `reason: ${reason}`
      );
    }
  }

  private async getInbox(target: string): Promise<string> {
    const cached = this.inboxCache.get(target);
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
    const { type, inbox } = (await compact(json)) as any;
    assert.strictEqual(type, 'Person', 'Invalid actor type');
    assert.strictEqual(typeof inbox, 'string', 'Missing inbox field');

    this.inboxCache.set(target, inbox);

    return inbox;
  }
}
