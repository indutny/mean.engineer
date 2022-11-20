import { randomUUID, generateKeyPairSync } from 'crypto';
import NativeConstructor from 'better-sqlite3';
import type { Database as Native } from 'better-sqlite3';

import { BASE_URL, DB_PATH } from './config.js';

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

export type FollowOptions = Readonly<{
  id?: string;
  owner: string;
  actor: string;
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
        modulusLength: 2048,
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

  public unfollow(id: string): void {
    // TODO(indutny): cache statement
    this.db.prepare(`
      DELETE FROM followers
      WHERE id = $id
    `).run({ id });
  }

  //
  // Private
  //

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
