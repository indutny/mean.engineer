import NativeConstructor from 'better-sqlite3';
import type { Database as Native } from 'better-sqlite3';

import { DB_PATH, DB_PAGE_SIZE } from './config.js';
import { User } from './models/user.js';
import { OutboxJob, type OutboxJobAttributes } from './models/outboxJob.js';

export type Paginated<Row> = Readonly<{
  totalRows: number;
  rows?: ReadonlyArray<Row>;
  hasMore: boolean;
}>;

export type FollowOptions = Readonly<{
  owner: URL;
  actor: URL;
}>;

export type UnfollowOptions = Readonly<{
  owner: URL;
  actor: URL;
}>;

type PaginateOptions = Readonly<{
  page?: number;
  pluck?: boolean;
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

  public async unfollow({ owner, actor }: UnfollowOptions): Promise<void> {
    // TODO(indutny): cache statement
    this.db.prepare(`
      DELETE FROM followers
      WHERE owner IS $owner AND actor IS $actor
    `).run({ owner: owner.toString(), actor: actor.toString() });
  }

  public async getFollowers(
    owner: URL,
    page?: number,
  ): Promise<Paginated<string>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE owner = $owner
      ORDER BY createdAt DESC
    `, 'actor', { owner: owner.toString() }, { page, pluck: true });
  }

  public async getFollowing(
    actor: URL,
    page?: number,
  ): Promise<Paginated<string>> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE actor = $actor
      ORDER BY createdAt DESC
    `, 'owner', { actor: actor.toString() }, { page, pluck: true });
  }

  //
  // Outbox Jobs
  //

  public async createOutboxJob(
    attributes: Omit<OutboxJobAttributes, 'id'>,
  ): Promise<OutboxJob> {
    const id = this.db.prepare(`
      INSERT INTO outboxJobs
      (username, target, data, attempts, createdAt)
      VALUES
      ($username, $target, $data, $attempts, $createdAt)
      RETURNING rowid
    `).pluck().get({
      ...attributes,
      username: attributes.user.username,
      target: attributes.target.toString(),
      createdAt: attributes.createdAt.getTime(),
    });

    return new OutboxJob({
      ...attributes,
      id,
    });
  }

  public async getOutboxJobs(): Promise<ReadonlyArray<OutboxJob>> {
    const rows = this.db.prepare(`
      SELECT
        outboxJobs.*

        users.passwordHash AS userPasswordHash,
        users.passwordSalt AS userPasswordSalt,
        users.passwordIterations AS userPasswordIterations,
        users.privateKey AS userPrivateKey,
        users.publicKey AS userPublicKey,
        users.createdAt AS userCreatedAt,
        users.profileName AS userProfileName,
        users.about AS userAbout
      FROM outboxJobs
      INNER JOIN users ON
        users.username = outboxJobs.username
      ORDER BY createdAt ASC;
    `).all();

    return rows.map((columns): OutboxJob => {
      return OutboxJob.fromJoinedColumns(columns);
    });
  }

  public async incrementOutboxJobAttempts(
    job: OutboxJob,
  ): Promise<OutboxJob> {
    const newAttempts = this.db.prepare(`
      UPDATE outboxJobs
      SET attempts = attempts + 1
      WHERE id = $id
      RETURNING attempts
    `).pluck().get({
      id: job.id,
    });

    return new OutboxJob({
      ...job.toAttributes(),
      attempts: newAttempts,
    });
  }

  //
  // Private
  //

  // TODO(indutny): cache
  private paginate<Row>(
    query: string,
    columns: string,
    params: Record<string, unknown>,
    { page, pluck = false }: PaginateOptions
  ): Paginated<Row> {
    const totalRows = this.db.prepare(
      query.replace('<COLUMNS>', 'COUNT(*)')
    ).pluck().get(params);

    let rows: ReadonlyArray<Row> | undefined;
    let hasMore = totalRows !== 0;
    if (page !== undefined) {
      let stmt = this.db.prepare(`
        ${query.replace('<COLUMNS>', columns)}
        LIMIT $pageSize
        OFFSET $offset
      `);

      if (pluck) {
        stmt = stmt.pluck();
      }


      const offset = page * DB_PAGE_SIZE;
      rows = stmt.all({
        ...params,
        pageSize: DB_PAGE_SIZE,
        offset,
      });

      hasMore = (offset + rows.length) < totalRows;
    }

    return {
      totalRows,
      rows,
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

        CREATE TABLE outboxJobs (
          rowid INTEGER PRIMARY KEY,
          username STRING NON NULL,
          target STRING NON NULL,
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

        CREATE TABLE posts (
          id STRING NON NULL,
          owner STRING NON NULL,
          content STRING NON NULL,
          createdAt INTEGER NON NULL,

          PRIMARY KEY (owner, id)
        );

        CREATE INDEX posts_by_owner ON posts (owner, createdAt ASC);
      `);
    },
  ];
}
