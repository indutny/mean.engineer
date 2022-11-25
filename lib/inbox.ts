import assert from 'assert';
import createDebug from 'debug';

import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { Activity, Follow, Undo } from './schemas/activityPub.js';
import { getLinkHref } from './schemas/activityPub.js';
import type { Outbox } from './outbox.js';
import { isSameHost } from './util/isSameHost.js';

const debug = createDebug('me:inbox');

export type InboxOptions = Readonly<{
  outbox: Outbox;
  db: Database;
}>;

export class Inbox {
  private readonly outbox: Outbox;
  private readonly db: Database;

  constructor({ outbox, db }: InboxOptions) {
    this.outbox = outbox;
    this.db = db;
  }

  public async handleActivity(
    user: User,
    activity: Activity,
  ): Promise<void> {
    debug('handleActivity %O', activity);

    const { type } = activity;
    if (type === 'Follow') {
      return this.handleFollowRequest(user, activity);
    } else if (type === 'Undo') {
      return this.handleUndo(user, activity);
    }

    throw new Error(`Unsupported inbox activity: ${type}`);
  }

  private async handleFollowRequest(
    user: User,
    follow: Follow,
  ): Promise<void> {
    const object = new URL(getLinkHref(follow.object));
    const owner = user.getURL();
    assert.strictEqual(
      object.toString(),
      owner.toString(),
      'Invalid "object" field of Follow request'
    );

    const actor = new URL(getLinkHref(follow.actor));

    await this.db.follow({
      owner,
      actor,
    });

    try {
      await this.outbox.acceptFollow(user, follow);
    } catch (error) {
      await this.db.unfollow({ owner, actor });
      throw error;
    }
  }

  private async handleUndo(user: User, undo: Undo): Promise<void> {
    const { object } = undo;

    const { type } = object;
    if (type === 'Follow') {
      return this.handleUnfollow(user, undo, object);
    }

    throw new Error(`Unsupported undo object: ${type}`);
  }

  private async handleUnfollow(
    user: User,
    undo: Undo,
    follow: Follow,
  ): Promise<void> {
    const actor = new URL(getLinkHref(undo.actor));
    assert(
      !follow.id || isSameHost(new URL(follow.id), actor),
      `Cross-origin unfollow follow=${follow.id} actor=${actor}`
    );
    await this.db.unfollow({
      actor,
      owner: user.getURL(),
    });
  }
}
