import assert from 'assert';
import createDebug from 'debug';

import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { AnyActivity, Activity } from './schemas/activityPub.js';
import { AnyActivityValidator, getLinkHref } from './schemas/activityPub.js';
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
    activity: AnyActivity,
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
    follow: Activity,
  ): Promise<void> {
    const { object: objectString } = follow;
    assert(
      typeof objectString === 'string',
      'follow.object is not a string',
    );

    const object = new URL(objectString);
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

  private async handleUndo(user: User, activity: Activity): Promise<void> {
    const { object } = activity;

    assert(typeof object !== 'string', 'Undo object must be present');
    assert(
      AnyActivityValidator.Check(object),
      'Undo object must be an activity',
    );
    const { type } = object;
    if (type === 'Follow') {
      return this.handleUnfollow(user, activity, object);
    }

    throw new Error(`Unsupported inbox activity: ${type}`);
  }

  private async handleUnfollow(
    user: User,
    activity: Activity,
    follow: Activity,
  ): Promise<void> {
    const actor = new URL(getLinkHref(activity.actor));
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
