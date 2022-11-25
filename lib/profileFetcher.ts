import LRU from 'lru-cache';
import createDebug from 'debug';
import pLimit, { type LimitFunction } from 'p-limit';

import type { Instance } from './instance.js';
import { compact } from './util/jsonld.js';
import { ActorValidator, type Actor } from './schemas/activityPub.js';
import { USER_AGENT } from './config.js';
import { HOUR, ACTIVITY_JSON_MIME } from './constants.js';

const debug = createDebug('me:profileFetcher');

export type ProfileFetcherOptions = Readonly<{
  cacheSize?: number;
  cacheTTL?: number;
  concurrency?: number;
}>;

export type ProfileAction<ReturnValue> = (
  profile: Actor,
) => Promise<ReturnValue>;

// TODO(indutny): store cached profiles in the database.
export class ProfileFetcher {
  private readonly cache: LRU<string, Promise<Actor> | Actor>;
  private readonly limit: LimitFunction;

  constructor(private readonly fastify: Instance, {
    cacheSize = 100,
    cacheTTL = HOUR,
    concurrency = 1000,
  }: ProfileFetcherOptions = {}) {
    this.cache = new LRU({ max: cacheSize, ttl: cacheTTL });
    this.limit = pLimit(concurrency);
  }

  public async withProfile<ReturnValue>(
    url: URL,
    action: ProfileAction<ReturnValue>,
  ): Promise<ReturnValue> {
    const cacheKey = url.toString();

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      try {
        const cachedActor = await cached;

        return await action(cachedActor);
      } catch (error) {
        debug(
          `cached profile ${url} couldn't be processed by due to an error %O`,
          error,
        );

        // Invalidate cache on error
        this.cache.delete(cacheKey);

        // Fallthrough
      }
    }

    const profileFetch = this.limit(() => this.fetchProfile(url));

    this.cache.set(cacheKey, profileFetch);

    const actor = await profileFetch;
    this.cache.set(cacheKey, actor);

    return action(actor);
  }

  private async fetchProfile(url: URL): Promise<Actor> {
    const fastify: Instance = this.fastify;

    // TODO(indutny): blocklist
    const response = await fetch(url, {
      headers: {
        accept: ACTIVITY_JSON_MIME,
        'user-agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      fastify.assert(
        response.ok,
        `Error fetching profile ${url}: ` +
          `status=${response.status} body=${JSON.stringify(body)}`
      );
    }

    const json = await response.json();
    const actor = await compact(json);
    debug('got remote actor %O', actor);
    fastify.assert(
      ActorValidator.Check(actor),
      'Remote object is not a valid actor',
    );

    return actor;
  }
}
