import type { Database } from './db.js';

export type OutboxOptions = Readonly<{
  db: Database;
}>;

export class Outbox {
  private readonly db: Database;

  constructor({ db }: OutboxOptions) {
    this.db = db;
  }
}
