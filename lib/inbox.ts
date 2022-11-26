import assert from 'assert';
import createDebug from 'debug';

import type { Database } from './db.js';
import type { User } from './models/user.js';
import type { Activity, Follow, Undo, Create } from './schemas/activityPub.js';
import { getLinkURL } from './schemas/activityPub.js';
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
    } else if (type === 'Create') {
      return this.handleCreate(user, activity);
    }

    // TODO(indutny): expand to/cc/audience if they are local.

    throw new Error(`Unsupported inbox activity: ${type}`);
  }

  private async handleFollowRequest(
    user: User,
    follow: Follow,
  ): Promise<void> {
    const object = getLinkURL(follow.object);
    const owner = user.getURL();
    assert.strictEqual(
      object.toString(),
      owner.toString(),
      'Invalid "object" field of Follow request'
    );

    const actor = getLinkURL(follow.actor);

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
    const actor = getLinkURL(undo.actor);

    assert(
      object.id && isSameHost(new URL(object.id), actor),
      `Cross-origin undo object=${object.id} actor=${actor}`
    );

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
    const actor = getLinkURL(undo.actor);
    await this.db.unfollow({
      actor,
      owner: user.getURL(),
    });
  }

  private async handleCreate(
    user: User,
    create: Create,
  ): Promise<void> {
    const { object } = create;
    const actor = getLinkURL(create.actor);

    const owner = user.getURL();
    const ownerString = owner.toString();

    assert(
      object.id && isSameHost(new URL(object.id), actor),
      `Cross-origin create object=${object.id} actor=${actor}`
    );

    const isFollowing = await this.db.isFollowing({ owner, actor });
    const isMention = [object.tag].flat().some((tag) => {
      if (!tag) {
        return false;
      }
      if (typeof tag === 'string') {
        return false;
      }
      return tag.type === 'Mention' && tag.href === ownerString;
    });

    if (!isFollowing || !isMention) {
      debug(
        'dropping object %O because we don\'t follow actor %s',
        object, actor,
      );
      return;
    }

    const finalObject = {
      ...object,
      attributedTo: actor.toString(),
    };

    // TODO(indutny): put the object into inbox
  }
}
