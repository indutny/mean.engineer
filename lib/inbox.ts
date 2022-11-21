import assert from 'assert';

import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { Activity } from './types/as.d';

import type { Outbox } from './outbox.js';

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

  public async handleActivity(user: User, activity: Activity): Promise<void> {
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
    follow: Activity,
  ): Promise<void> {
    const { object: objectString } = follow;
    const object = new URL(objectString);
    const owner = user.getURL();
    assert.strictEqual(
      object.toString(),
      owner.toString(),
      'Invalid "object" field of Follow request'
    );

    const actor = new URL(follow.actor);

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

  private async handleUndo(user: User, activity: Activity): Promise<void> {
    const { object } = activity;
    assert(object != null, 'Missing undo object');

    const { type } = object;
    if (type === 'Follow') {
      return this.handleUnfollow(user, activity);
    }

    throw new Error(`Unsupported inbox activity: ${type}`);
  }

  private async handleUnfollow(user: User, activity: Activity): Promise<void> {
    const { object: follow } = activity;
    const actor = new URL(activity.actor);
    assert.strictEqual(
      new URL(follow.id).origin,
      actor.origin,
      'Cross-origin unfollow'
    );
    await this.db.unfollow({
      actor,
      owner: user.getURL(),
    });
  }
}
