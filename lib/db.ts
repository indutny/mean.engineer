import NativeConstructor from 'better-sqlite3';
import type { Database as Native } from 'better-sqlite3';

import { DB_PATH, DB_PAGE_SIZE } from './config.js';
import { User } from './models/user.js';
import { AuthToken } from './models/authToken.js';
import { OutboxJob } from './models/outboxJob.js';
import { InboxObject, type InboxObjectColumns } from './models/inboxObject.js';
import { type UnknownObject } from './schemas/activityPub.js';

export type Paginated<Item> = Readonly<{
  totalItems: number;
  items?: ReadonlyArray<Item>;
  hasMore: boolean;
}>;

export type FollowOptions = Readonly<{
  owner: URL;
  actor: URL;
}>;

type PaginateOptions<Columns, Item> = Readonly<{
  page?: number;

  fromColumns(columns: Columns): Item;
}>;

export class Database {
  private readonly db: Native;

  constructor(path = DB_PATH) {
    const db = new NativeConstructor(path);

    db.pragma('journal_mode = WAL');

    db.transaction(() => {
      const startingVersion = db.pragma('user_version', { simple: true });

      for (const migration of Database.migrations.slice(startingVersion)) {
        migration(db);
      }

      db.pragma(`user_version = ${Database.migrations.length}`);
    })();

    this.db = db;
  }

  public close(): void {
    this.db.close();
  }

  //
  // Users
  //

  public async saveUser(user: User): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO users
      (username, passwordHash, passwordSalt, passwordIterations,
       privateKey, publicKey, createdAt, profileName, about)
      VALUES
      ($username, $passwordHash, $passwordSalt, $passwordIterations,
       $privateKey, $publicKey, $createdAt, $profileName, $about)
    `).run({
      ...user.toColumns(),
    });
  }

  // TODO(indutny): Cache results
  public async loadUser(username: string): Promise<User | undefined> {
    // TODO(indutny): cache statement
    const columns = this.db
      .prepare('SELECT * FROM users WHERE username = $username')
      .get({ username });
    if (!columns) {
      return undefined;
    }

    return User.fromColumns(columns);
  }

  //
  // Auth
  //

  public async saveAuthToken(token: AuthToken): Promise<void> {
    this.db.prepare(`
      INSERT INTO authTokens
      (id, username, title, hash, salt, iterations, createdAt)
      VALUES
      ($id, $username, $title, $hash, $salt, $iterations, $createdAt)
    `).run(token.toColumns());
  }

  // TODO(indutny): Cache results
  public async loadAuthToken(
    id: Buffer,
  ): Promise<AuthToken | undefined> {
    const columns = this.db.prepare(`
      SELECT * FROM authTokens
      WHERE id = $id
    `).get({ id });
    if (!columns) {
      return undefined;
    }

    return AuthToken.fromColumns(columns);
  }

  //
  // Followers
  //

  public async follow({
    owner,
    actor,
  }: FollowOptions): Promise<void> {
    // TODO(indutny): cache statement
    this.db.prepare(`
      INSERT OR REPLACE INTO followers
      (owner, actor, createdAt)
      VALUES
      ($owner, $actor, $createdAt)
    `).run({
      owner: owner.toString(),
      actor: actor.toString(),
      createdAt: Date.now(),
    });
  }

  public async unfollow({ owner, actor }: FollowOptions): Promise<void> {
    // TODO(indutny): cache statement
    this.db.prepare(`
      DELETE FROM followers
      WHERE owner IS $owner AND actor IS $actor
    `).run({ owner: owner.toString(), actor: actor.toString() });
  }

  public async getFollowers(
    owner: URL,
  ): Promise<ReadonlyArray<URL>> {
    return this.db.prepare(`
      SELECT actor FROM followers
      WHERE owner = $owner
      ORDER BY createdAt DESC
    `).pluck().all({ owner: owner.toString() });
  }

  public async isFollowing({ owner, actor }: FollowOptions): Promise<boolean> {
    return this.db.prepare(`
      SELECT COUNT(*) FROM followers
      WHERE owner = $owner AND actor = $actor
    `).pluck().get({ owner: owner.toString(), actor: actor.toString() }) !== 0;
  }

  public async getPaginatedFollowers(
    owner: URL,
    page?: number,
  ): Promise<Paginated<URL>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE owner = $owner
      ORDER BY createdAt DESC
    `, 'actor', { owner: owner.toString() }, {
      page,
      fromColumns: ({ actor }: { actor: URL }) => actor,
    });
  }

  public async getPaginatedFollowing(
    actor: URL,
    page?: number,
  ): Promise<Paginated<URL>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE actor = $actor
      ORDER BY createdAt DESC
    `, 'owner', { actor: actor.toString() }, {
      page,
      fromColumns: ({ owner }: { owner: URL }) => owner,
    });
  }

  //
  // Objects
  //

  public async saveObject(object: InboxObject): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO objects
      (url, owner, actor, json, isPublic, createdAt)
      VALUES
      ($url, $owner, $actor, $json, $isPublic, $createdAt)
    `).run(object.toColumns());
  }

  public async loadObject(url: URL): Promise<InboxObject | undefined> {
    const columns = this.db.prepare(`
      SELECT * FROM objects
      WHERE url = $url;
    `).get({ url: url.toString() });

    if (!columns) {
      return undefined;
    }

    return InboxObject.fromColumns(columns);
  }

  public async getPaginatedTimeline(
    owner: URL,
    page?: number,
  ): Promise<Paginated<UnknownObject>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM objects
      WHERE isPublic == 1 AND owner = $owner
      ORDER BY createdAt DESC
    `, '*', { owner: owner.toString() }, {
      page,
      fromColumns(columns: InboxObjectColumns) {
        return InboxObject.fromColumns(columns).object;
      },
    });
  }

  public async getPaginatedInbox(
    owner: URL,
    page?: number,
  ): Promise<Paginated<UnknownObject>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM objects
      WHERE owner = $owner
      ORDER BY createdAt DESC
    `, '*', { owner: owner.toString() }, {
      page,
      fromColumns(columns: InboxObjectColumns) {
        return InboxObject.fromColumns(columns).object;
      },
    });
  }

  //
  // Outbox Jobs
  //

  public async saveOutboxJob(job: OutboxJob): Promise<void> {
    this.db.prepare(`
      INSERT INTO outboxJobs
      (id, actor, inbox, data, attempts, createdAt)
      VALUES
      ($id, $actor, $inbox, $data, $attempts, $createdAt)
    `).run(job.toColumns());
  }

  public async getOutboxJobs(): Promise<ReadonlyArray<OutboxJob>> {
    const rows = this.db.prepare(`
      SELECT *
      FROM outboxJobs
      ORDER BY createdAt ASC;
    `).all();

    return rows.map((columns): OutboxJob => {
      return OutboxJob.fromColumns(columns);
    });
  }

  public async incrementAndGetOutboxJobAttempts(
    job: OutboxJob,
  ): Promise<number> {
    return this.db.prepare(`
      UPDATE outboxJobs
      SET attempts = attempts + 1
      WHERE id = $id
      RETURNING attempts
    `).pluck().get({
      id: job.id,
    });
  }

  public async deleteOutboxJob(
    job: OutboxJob,
  ): Promise<void> {
    this.db.prepare(`
      DELETE FROM outboxJobs
      WHERE id = $id
    `).run({
      id: job.id,
    });
  }

  //
  // Private
  //

  // TODO(indutny): cache
  private paginate<Columns, Item>(
    query: string,
    columns: string,
    params: Record<string, unknown>,
    { page, fromColumns }: PaginateOptions<Columns, Item>
  ): Paginated<Item> {
    const totalItems = this.db.prepare(
      query.replace('<COLUMNS>', 'COUNT(*)')
    ).pluck().get(params);

    let items: ReadonlyArray<Item> | undefined;
    let hasMore = totalItems !== 0;
    if (page !== undefined) {
      const stmt = this.db.prepare(`
        ${query.replace('<COLUMNS>', columns)}
        LIMIT $pageSize
        OFFSET $offset
      `);

      const offset = page * DB_PAGE_SIZE;
      items = stmt.all({
        ...params,
        pageSize: DB_PAGE_SIZE,
        offset,
      }).map(columns => fromColumns(columns));

      hasMore = (offset + items.length) < totalItems;
    }

    return {
      totalItems,
      items,
      hasMore,
    };
  }

  private static migrations: ReadonlyArray<(db: Native) => void> = [
    (db) => {
      db.exec(`
        CREATE TABLE users (
          username STRING PRIMARY KEY,
          passwordHash BLOB NON NULL,
          passwordSalt BLOB NON NULL,
          passwordIterations INTEGER NON NULL,
          privateKey STRING NON NULL,
          publicKey STRING NON NULL,
          createdAt INTEGER NON NULL,

          profileName STRING NON NULL,
          about STRING NON NULL
        );

        CREATE TABLE authTokens (
          id BLOB PRIMARY KEY,
          username STRING NON NULL REFERENCES users(username) ON DELETE CASCADE,
          title STRING NON NULL,
          hash BLOB NON NULL,
          salt BLOB NON NULL,
          iterations INTEGER NON NULL,
          createdAt INTEGER NON NULL
        );

        CREATE INDEX authTokens_by_username_and_title
        ON authTokens
        (username, title);

        CREATE TABLE outboxJobs (
          id BLOB PRIMARY KEY,
          actor STRING NON NULL REFERENCES users(username) ON DELETE CASCADE,
          inbox STRING NON NULL,
          data STRING NON NULL,
          attempts INTEGER NON NULL,
          createdAt INTEGER NON NULL
        );

        CREATE INDEX outboxJobs_by_createdAt ON outboxJobs (createdAt ASC);
        CREATE INDEX outboxJobs_by_attempts ON outboxJobs (attempts);

        CREATE TABLE followers (
          owner STRING NON NULL,
          actor STRING NON NULL,
          createdAt INTEGER NON NULL,

          PRIMARY KEY (owner, actor)
        );

        CREATE INDEX followers_by_owner ON followers (owner, createdAt ASC);
        CREATE INDEX followers_by_actor ON followers (actor, createdAt ASC);

        CREATE TABLE likes (
          owner STRING NON NULL,
          post STRING NON NULL,
          actor STRING NON NULL,
          createdAt INTEGER NON NULL,

          PRIMARY KEY (owner, post, actor)
        );

        CREATE INDEX likes_by_post ON likes (post, createdAt ASC);

        CREATE TABLE objects (
          url STRING PRIMARY KEY,
          owner STRING NON NULL,
          actor STRING NON NULL,
          json STRING NON NULL,
          isPublic INTEGER NON NULL,
          createdAt INTEGER NON NULL
        );

        CREATE INDEX objects_by_owner ON objects (owner, createdAt DESC);
        CREATE INDEX objects_by_createdAt ON objects (createdAt DESC);
        CREATE INDEX objects_by_public ON objects (isPublic, createdAt DESC);
        CREATE INDEX objects_by_public_and_actor ON objects
          (isPublic, actor, createdAt DESC);
      `);
    },
  ];
}
