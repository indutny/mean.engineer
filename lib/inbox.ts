import type { Database } from './db.js';

import { BASE_URL } from './config.js';
import type { Outbox } from './outbox.js';

export type InboxOptions = Readonly<{
  outbox: Outbox;
  db: Database;
}>;

export type Activity = Readonly<{
  id: string;
  type: string;
  actor: string;
  object: string;
}>;

export class Inbox {
  private readonly outbox: Outbox;
  private readonly db: Database;

  constructor({ outbox, db }: InboxOptions) {
    this.outbox = outbox;
    this.db = db;
  }

  public async handleActivity(user: string, activity: Activity): Promise<void> {
    const { type } = activity;
    if (type === 'Follow') {
      return this.handleFollowRequest(user, activity);
    }

    throw new Error(`Unsupported inbox activity: ${type}`);
  }

  private async handleFollowRequest(
    user: string,
    follow: Activity,
  ): Promise<void> {
    const { object } = follow;
    if (object !== `${BASE_URL}/users/${user}`) {
      throw new Error('Invalid "object" field of Follow request');
    }


  }
}
