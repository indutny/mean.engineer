import assert from 'assert';
import LRU from 'lru-cache';
import { createHash, createSign, randomUUID } from 'crypto';
import createDebug from 'debug';
import { setTimeout as sleep } from 'timers/promises';

import { USER_AGENT, BASE_URL, MAX_OUTBOX_JOB_ATTEMPTS } from './config.js';
import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { OutboxJob } from './models/outboxJob.js';
import type { Activity } from './types/as.d';
import { incrementalBackoff } from './util/incrementalBackoff.js';
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

  public async runJobs(): Promise<void> {
    const jobs = await this.db.getOutboxJobs();

    // TODO(indutny): limit parallelism
    for (const job of jobs) {
      try {
        this.onJob(job);
      } catch (error) {
        debug(`failed to run persisted job ${job.id} error=%j`, error);
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

    await this.queueJob(user, target, data);
  }

  //
  // Private
  //

  private async queueJob(
    actor: User,
    target: URL,
    data: OutboxJob['data'],
  ): Promise<void> {
    const job = await this.db.createOutboxJob({
      actor: actor.username,
      target,
      data,
      attempts: 0,
      createdAt: new Date(),
    });

    this.onJob(job);
  }

  private onJob(job: OutboxJob): void {
    const runWithRetry = async (): Promise<void> => {
      let currentJob = job;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          currentJob = await this.db.incrementOutboxJobAttempts(currentJob);
          if (currentJob.attempts > MAX_OUTBOX_JOB_ATTEMPTS) {
            await this.db.deleteOutboxJob(currentJob);
            debug(`outbox job ${currentJob.id} ran out of attempts`);
            return;
          }

          await this.runJob(currentJob);
          await this.db.deleteOutboxJob(currentJob);
          return;
        } catch (error) {
          debug(
            `outbox job ${currentJob.id} failed error=%j`,
            error,
          );

          this.invalidateInbox(job.target);

          const delay = incrementalBackoff(currentJob.attempts);
          debug(
            `outbox job ${currentJob.id} waiting for %dms`,
            delay,
          );
          await sleep(delay);
        }
      }
    };

    runWithRetry();
  }

  private async runJob({
    id,
    actor: actorUsername,
    target,
    data,
  }: OutboxJob): Promise<void> {
    const json = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      ...data,
    });

    const [inbox, actor] = await Promise.all([
      this.getInbox(target),
      this.db.loadUser(actorUsername),
    ]);
    if (!actor) {
      debug(`job ${id}: user ${actorUsername} no longer exists`);
      return;
    }

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
      inbox,
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

  private invalidateInbox(target: URL): void {
    this.inboxCache.delete(target.toString());
  }
}
