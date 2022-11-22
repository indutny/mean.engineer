import { User } from './user.js';

export type OutboxJobAttributes = Readonly<{
  id: number;
  user: User;
  target: URL;
  data: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}>;

export type OutboxJobColumns = Omit<
  OutboxJobAttributes,
  'user' | 'target' | 'createdAt'
> & Readonly<{
  username: string;
  target: string;
  createdAt: number;
}>;

export type OutboxJobJoinedColumns = OutboxJobColumns & Readonly<{
  userPasswordHash: Buffer;
  userPasswordSalt: Buffer;
  userPasswordIterations: number;
  userPrivateKey: string;
  userPublicKey: string;
  userCreatedAt: number;
  userProfileName: string;
  userAbout: string;
}>;

export class OutboxJob {
  public readonly id: number;
  public readonly user: User;
  public readonly target: URL;
  public readonly data: Record<string, unknown>;
  public readonly attempts: number;
  public readonly createdAt: Date;

  constructor(attributes: OutboxJobAttributes) {
    this.id = attributes.id;
    this.user = attributes.user;
    this.target = attributes.target;
    this.data = attributes.data;
    this.attempts = attributes.attempts;
    this.createdAt = attributes.createdAt;
  }

  public toAttributes(): OutboxJobAttributes {
    return { ...this };
  }

  public toColumns(): OutboxJobColumns {
    return {
      ...this,
      username: this.user.username,
      target: this.target.toString(),
      createdAt: this.createdAt.getTime(),
    };
  }

  public static fromJoinedColumns({
    username,
    target,
    createdAt,

    userPasswordHash,
    userPasswordSalt,
    userPasswordIterations,
    userPrivateKey,
    userPublicKey,
    userCreatedAt,
    userProfileName,
    userAbout,

    ...attributes
  }: OutboxJobJoinedColumns): OutboxJob {
    const user = User.fromColumns({
      username,
      passwordHash: userPasswordHash,
      passwordSalt: userPasswordSalt,
      passwordIterations: userPasswordIterations,
      privateKey: userPrivateKey,
      publicKey: userPublicKey,
      createdAt: userCreatedAt,
      profileName: userProfileName,
      about: userAbout,
    });
    return new OutboxJob({
      user,
      target: new URL(target),
      createdAt: new Date(createdAt),
      ...attributes,
    });
  }
}
