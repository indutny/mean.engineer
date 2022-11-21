import { randomUUID, generateKeyPairSync } from 'crypto';
import NativeConstructor from 'better-sqlite3';
import type { Database as Native } from 'better-sqlite3';

import { BASE_URL, DB_PATH, DB_PAGE_SIZE } from './config.js';

export type User = Readonly<{
  name: string;
  profileName: string;
  summary: string;
  privateKey: string;
  publicKey: string;
  createdAt: number;
}>;

export type CreateUserOptions = Readonly<{
  name: string;
  profileName: string;
  summary: string;
}>;

export type Paginated<Row> = Readonly<{
  totalRows: number;
  rows?: ReadonlyArray<Row>;
  hasMore: boolean;
}>;

export type FollowOptions = Readonly<{
  id?: string;
  owner: string;
  actor: string;
}>;

export type UnfollowOptions = Readonly<{
  id?: string;
  owner: string;
  actor: string;
}>;

type PaginateOptions = Readonly<{
  page?: number;
  pluck?: boolean;
}>;

export class Database {
  private readonly db: Native;

  constructor(path = DB_PATH) {
    const db = new NativeConstructor(DB_PATH);

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

  public createUser(user: CreateUserOptions): void {
    this.db.prepare(`
      INSERT INTO users
      (name, profileName, summary, privateKey, publicKey, createdAt)
      VALUES
      ($name, $profileName, $summary, $privateKey, $publicKey, $createdAt)
    `).run({
      ...user,
      ...generateKeyPairSync('rsa', {
        modulusLength: 64 * 1024,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }),
      createdAt: Date.now(),
    });
  }

  public getUser(name: string): User | undefined {
    // TODO(indutny): cache statement
    return this.db
      .prepare('SELECT * FROM users WHERE name = $name')
      .get({ name });
  }

  //
  // Followers
  //

  public follow({
    id = `${BASE_URL}/${randomUUID()}`,
    owner,
    actor,
  }: FollowOptions): string {
    // TODO(indutny): cache statement
    this.db.prepare(`
      INSERT INTO followers
      (id, owner, actor, createdAt)
      VALUES
      ($id, $owner, $actor, $createdAt)
    `).run({ id, owner, actor, createdAt: Date.now() });

    return id;
  }

  public unfollow({ id, owner, actor }: UnfollowOptions): void {
    // TODO(indutny): cache statement
    this.db.prepare(`
      DELETE FROM followers
      WHERE id IS $id OR (owner IS $owner AND actor IS $actor)
    `).run({ id: id ?? null, owner, actor });
  }

  public getFollowers(owner: string, page?: number): Paginated<string> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE owner = $owner
      ORDER BY createdAt DESC
    `, 'actor', { owner }, { page, pluck: true });
  }

  public getFollowing(actor: string, page?: number): Paginated<string> {
    return this.paginate(`
      SELECT <COLUMNS> FROM followers
      WHERE actor = $actor
      ORDER BY createdAt DESC
    `, 'owner', { actor }, { page, pluck: true });
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
          name STRING PRIMARY KEY,
          profileName STRING NON NULL,
          summary STRING NON NULL,
          privateKey STRING NON NULL,
          publicKey STRING NON NULL,
          createdAt INTEGER NON NULL
        );

        CREATE TABLE followers (
          id STRING PRIMARY KEY,
          owner STRING NON NULL,
          actor STRING NON NULL,
          createdAt INTEGER NON NULL,

          UNIQUE (owner, actor)
        );

        CREATE INDEX followers_by_owner ON followers (owner, createdAt ASC);
        CREATE INDEX followers_by_actor ON followers (actor, createdAt ASC);
        CREATE INDEX followers_by_owner_and_actor ON followers (owner, actor);

        CREATE TABLE likes (
          id STRING PRIMARY KEY,
          owner STRING NON NULL,
          post STRING NON NULL,
          actor STRING NON NULL,
          createdAt INTEGER NON NULL,

          UNIQUE (owner, post, actor)
        );

        CREATE INDEX likes_by_post ON likes (post, createdAt ASC);

        CREATE TABLE posts (
          id STRING NON NULL,
          owner STRING NON NULL,
          content STRING NON NULL,
          createdAt INTEGER NON NULL
        );

        CREATE INDEX posts_by_owner ON posts (owner, createdAt ASC);
      `);
    },
  ];
}
