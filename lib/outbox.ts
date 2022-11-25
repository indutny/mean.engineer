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
import type { Activity, Follow } from './schemas/activityPub.js';
import { getLinkHref } from './schemas/activityPub.js';
import { incrementalBackoff } from './util/incrementalBackoff.js';
import { ACTIVITY_JSON_MIME } from './constants.js';
import type { Instance } from './instance.js';

const debug = createDebug('me:outbox');

const MAX_INBOX_FETCH_CONCURRENCY = 100;

export type OutboxOptions = Readonly<{
  fastify: Instance;
  db: Database;
}>;

type GetInboxesOptions = Readonly<{
  resolve: boolean;
}>;

export class Outbox {
  private readonly fastify: Instance;
  private readonly db: Database;

  constructor({
    fastify,
    db,
  }: OutboxOptions) {
    this.fastify = fastify;
    this.db = db;
  }

  public async runJobs(): Promise<void> {
    const jobs = await this.db.getOutboxJobs();

    // TODO(indutny): limit parallelism
    for (const job of jobs) {
      try {
        this.onJob(job);
      } catch (error) {
        debug(
          `failed to run persisted job ${job.getDebugId()} error=%O`,
          error,
        );
      }
    }
  }

  public async acceptFollow(user: User, follow: Follow): Promise<void> {
    const us = user.getURL();
    const data = {
      id: `${BASE_URL}/${randomUUID()}`,
      type: 'Accept',
      actor: us,
      object: follow,
    };

    const target = new URL(getLinkHref(follow.actor));

    debug(`accepting follow ${us} <- ${target}`);

    const [inbox] = await this.getInboxes(target, {
      resolve: false,
    });
    this.fastify.assert(
      inbox !== undefined,
      400,
      `Did not get an inbox for ${target}`,
    );
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
      'sending activity %O to=%j cc=%j bto=%j bcc=%j', data, to, cc, bcc, bto,
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
      'got unique inboxes for %O, %j', data, uniqueInboxes
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
            `outbox job ${job.getDebugId()} failed error=%O`,
            error,
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
      `content-type: ${ACTIVITY_JSON_MIME}`,
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
      'content-type': ACTIVITY_JSON_MIME,
      'user-agent': USER_AGENT,
      'signature': [
        `keyId="${keyId}"`,
        'algorithm="rsa-sha256"',
        'headers="(request-target) host date digest content-type"',
        `signature="${signature}"`,
      ].join(','),
    };

    debug(
      `job ${id} making outgoing request to %j plaintext=%j headers=%O`,
      inbox.toString(),
      plaintext,
      headers,
    );

    const res = await fetch(inbox, {
      method: 'POST',
      headers,
      body: json,
    });
    debug(
      `job ${id} got response status=%d headers=%O`,
      res.status,
      Array.from(res.headers.entries()),
    );
    if (res.ok) {
      return;
    }

    const reason = await res.text();
    throw new Error(
      `Failed to post to inbox: ${inbox}, status: ${res.status}, ` +
      `reason: ${reason}`
    );
  }

  private async getInboxes(
    target: URL,
    options: GetInboxesOptions,
  ): Promise<ReadonlyArray<URL>> {
    const fastify: Instance = this.fastify;

    try {
      if (target.host === HOST) {
        return this.getLocalInboxes(target, options);
      }

      return fastify.profileFetcher.withProfile(target, async (profile) => {
        const inbox = profile.endpoints?.sharedInbox || profile.inbox;
        fastify.assert(
          typeof inbox === 'string',
          400,
          'Missing inbox field',
        );

        return [new URL(inbox)];
      });
    } catch (error) {
      debug('getInbox got error=%O', error);
      return [];
    }
  }

  private async getLocalInboxes(
    target: URL,
    options: GetInboxesOptions
  ): Promise<ReadonlyArray<URL>> {
    const fastify: Instance = this.fastify;
    fastify.assert(
      !target.search,
      403,
      'Queries are not allowed for local inboxes',
    );

    const userMatch = target.pathname.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      const user = await this.db.loadUser(userMatch[1]);
      fastify.assert(user, 404, `Local user ${userMatch[1]} not found`);
      return [user.getInboxURL()];
    }

    const followersMatch = target.pathname.match(
      /^\/users\/([^/]+)\/followers$/
    );
    if (followersMatch) {
      fastify.assert(
        options.resolve,
        500,
        `Refuse to resolve local followers for ${target}`,
      );

      const user = await this.db.loadUser(followersMatch[1]);
      fastify.assert(user, 404, `Local user ${followersMatch[1]} not found`);

      const followers = await this.db.getFollowers(user.getURL());
      const inboxes = await pMap(
        followers,
        follower => this.getInboxes(follower, options),
        {
          concurrency: MAX_INBOX_FETCH_CONCURRENCY,
          stopOnError: true,
        },
      );

      return inboxes.flat();
    }

    throw new Error(`Failed to parse local url ${target}`);
  }
}
