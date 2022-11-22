import assert from 'assert';
import LRU from 'lru-cache';
import { createHash, createSign, randomUUID } from 'crypto';
import createDebug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import pMap from 'p-map';

import {
  HOST,
  USER_AGENT,
  BASE_URL,
  MAX_OUTBOX_JOB_ATTEMPTS,
} from './config.js';
import type { Database } from './db.js';
import type { User } from './models/user.js';
import { OutboxJob } from './models/outboxJob.js';
import { ACTOR_TYPES, type Activity } from './types/as.js';
import { incrementalBackoff } from './util/incrementalBackoff.js';
import { compact } from './util/jsonld.js';

const debug = createDebug('me:outbox');

const MAX_INBOX_FETCH_CONCURRENCY = 100;

export type OutboxOptions = Readonly<{
  db: Database;
  cacheSize?: number;
  cacheTTL?: number;
}>;

type GetInboxesOptions = Readonly<{
  resolve: boolean;
}>;

export class Outbox {
  private readonly db: Database;
  private readonly inboxCache: LRU<string, ReadonlyArray<URL>>;

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

  public async runJobs(): Promise<void> {
    const jobs = await this.db.getOutboxJobs();

    // TODO(indutny): limit parallelism
    for (const job of jobs) {
      try {
        this.onJob(job);
      } catch (error) {
        debug(
          `failed to run persisted job ${job.getDebugId()} error=%j`,
          error.stack,
        );
      }
    }
  }

  public async acceptFollow(user: User, follow: Activity): Promise<void> {
    const us = user.getURL();
    const data = {
      id: `${BASE_URL}/${randomUUID()}`,
      type: 'Accept',
      actor: us,
      object: follow,
    };

    const target = new URL(follow.actor);

    debug(`accepting follow ${us} <- ${target}`);

    const [inbox] = await this.getInboxes(target, {
      resolve: false,
    });
    await this.queueJob(user, inbox, data);
  }

  public async sendActivity(user: User, activity: Activity): Promise<void> {
    const {
      bto,
      bcc,
      ...data
    } = activity;

    const {
      to,
      cc,
    } = data;

    debug(
      'sending activity %j to=%j cc=%j bto=%j bcc=%j', data, to, cc, bcc, bto,
    );

    const targets = [bto, bcc, to, cc].flat()
      .filter((x: string | undefined): x is string => x !== undefined)
      .map(x => new URL(x));

    const inboxes = await pMap(
      targets,
      target => this.getInboxes(target, { resolve: true }),
      {
        concurrency: MAX_INBOX_FETCH_CONCURRENCY,
        stopOnError: true,
      },
    );

    // Deduplicate
    const uniqueInboxes = [...new Set(inboxes.flat())];
    debug(
      'got unique inboxes for %j, %j', data, uniqueInboxes
    );

    await Promise.all(uniqueInboxes.map(
      inbox => this.queueJob(user, inbox, data),
    ));
  }

  //
  // Private
  //

  private async queueJob(
    actor: User,
    inbox: URL,
    data: OutboxJob['data'],
  ): Promise<void> {
    const job = OutboxJob.create({
      actor: actor.username,
      inbox,
      data,
      attempts: 0,
    });
    await this.db.saveOutboxJob(job);

    this.onJob(job);
  }

  private onJob(job: OutboxJob): void {
    const runWithRetry = async (): Promise<void> => {
      let { attempts } = job;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          attempts = await this.db.incrementAndGetOutboxJobAttempts(job);
          if (attempts > MAX_OUTBOX_JOB_ATTEMPTS) {
            await this.db.deleteOutboxJob(job);
            debug(`outbox job ${job.getDebugId()} ran out of attempts`);
            return;
          }

          await this.runJob(job);
          await this.db.deleteOutboxJob(job);
          return;
        } catch (error) {
          debug(
            `outbox job ${job.getDebugId()} failed error=%j`,
            error.stack,
          );

          const delay = incrementalBackoff(attempts);
          debug(
            `outbox job ${job.getDebugId()} waiting for %dms`,
            delay,
          );
          await sleep(delay);
        }
      }
    };

    runWithRetry();
  }

  private async runJob(job: OutboxJob): Promise<void> {
    const {
      actor: actorUsername,
      inbox,
      data,
    } = job;

    const id = job.getDebugId();
    const json = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...data,
    });

    const actor = await this.db.loadUser(actorUsername);
    if (!actor) {
      debug(`job ${id}: user ${actorUsername} no longer exists`);
      return;
    }

    const digest = createHash('sha256').update(json).digest('base64');
    const date = new Date().toUTCString();
    const { host } = new URL(inbox);

    const plaintext = [
      `(request-target): post ${inbox.pathname}${inbox.search}`,
      `host: ${host}`,
      `date: ${date}`,
      `digest: sha-256=${digest}`,
      'content-type: application/activity+json'
    ].join('\n');

    const signature = createSign('RSA-SHA256')
      .update(plaintext)
      .sign(actor.privateKey)
      .toString('base64');

    const keyId = `${actor.getURL()}#main-key`;

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
      `job ${id} making outgoing request to %j plaintext=%j headers=%j`,
      inbox.toString(),
      plaintext,
      headers,
    );

    const res = await fetch(inbox, {
      method: 'POST',
      headers,
      body: json,
    });
    debug(`job ${id} got response`, res.status, res.headers);
    if (res.status < 200 || res.status >= 300) {
      const reason = await res.text();
      throw new Error(
        `Failed to post to inbox: ${inbox}, status: ${res.status}, ` +
          `reason: ${reason}`
      );
    }
  }

  private async getInboxes(
    target: URL,
    options: GetInboxesOptions,
  ): Promise<ReadonlyArray<URL>> {
    try {
      if (target.host === HOST) {
        return this.getLocalInboxes(target, options);
      }

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

      assert(200 <= res.status && res.status < 300, 'Invalid status code');

      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ld = (await compact(json)) as any;
      const { type } = ld;

      // TODO(indutny): resolve collections
      assert(ACTOR_TYPES.has(type), `Invalid actor type ${type}`);

      const inbox = ld.endpoints?.sharedInbox || ld.inbox;
      assert.strictEqual(typeof inbox, 'string', 'Missing inbox field');

      const urls = [new URL(inbox)];

      this.inboxCache.set(cacheKey, urls);

      return urls;
    } catch (error) {
      debug('getInbox got error=%j', error.stack);
      return [];
    }
  }

  private async getLocalInboxes(
    target: URL,
    { resolve }: GetInboxesOptions
  ): Promise<ReadonlyArray<URL>> {
    assert(!target.search, 'Queries are not allowed for local inboxes');

    const userMatch = target.pathname.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      const user = await this.db.loadUser(userMatch[1]);
      assert(user, `Local user ${userMatch[1]} not found`);
      return [user.getInboxURL()];
    }

    const followersMatch = target.pathname.match(
      /^\/users\/([^/]+)\/followers$/
    );
    if (followersMatch) {
      assert(resolve, `Refuse to resolve local followers for ${target}`);

      const user = await this.db.loadUser(followersMatch[1]);
      assert(user, `Local user ${followersMatch[1]} not found`);

      return this.db.getFollowers(user.getURL());
    }

    throw new Error(`Failed to parse local url ${target}`);
  }

  private invalidateInbox(target: URL): void {
    this.inboxCache.delete(target.toString());
  }
}
