import assert from 'assert';
import { randomUUID } from 'crypto';

import type { User, Database } from './db.js';
import type { Activity } from './as.js';

import { BASE_URL } from './config.js';
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
    const { object } = follow;
    assert.strictEqual(
      object,
      `${BASE_URL}/users/${user.name}`,
      'Invalid "object" field of Follow request'
    );

    this.db.follow({ id: follow.id ,owner: user.name, actor: follow.actor });

    await this.outbox.acceptFollow(user, follow);
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
    assert.strictEqual(
      new URL(follow.id).origin,
      new URL(activity.actor).origin,
      'Cross-origin unfollow'
    );
    this.db.unfollow(follow.id);
  }
}
