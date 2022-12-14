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
      debug('cache hit %j', url);
      try {
        const cachedActor = await cached;

        debug('running action for cached profile %j', url);
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

    debug('fetching profile %j', url);

    const profileFetch = this.limit(() => this.fetchProfile(url));

    let profile: Actor;
    try {
      this.cache.set(cacheKey, profileFetch);
      profile = await profileFetch;
    } catch (error) {
      debug('failed to fetch profile %j error %O', url, error);
      this.cache.delete(cacheKey);
      throw error;
    }

    debug('running action on profile %j', url);
    this.cache.set(cacheKey, profile);
    return action(profile);
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
        404,
        `Error fetching profile ${url}: ` +
          `status=${response.status} body=${JSON.stringify(body)}`
      );
    }

    // TODO(indutny): use cache headers in response to determine max age of
    //   the cached profile.

    const json = await response.json();
    const actor = await compact(json);
    debug('got remote actor %O', actor);
    fastify.assert(
      ActorValidator.Check(actor),
      400,
      'Remote object is not a valid actor',
    );

    return actor;
  }
}
