import {
  randomBytes,
  pbkdf2,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

import {
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LEN,
  PBKDF2_HASH_ALGO,
  PBKDF2_OUTPUT_LEN,
} from '../config.js';

const PLAINTEXT_TOKEN_LEN = 16;

export interface AuthTokenAttributes {
  username: string;
  title: string;
  hash: Buffer;
  salt: Buffer;
  iterations: number;
  createdAt: Date;
}

export type AuthTokenColumns = Omit<
  AuthTokenAttributes,
  'createdAt'
> & Readonly<{
  createdAt: number;
}>;

export type NewAuthTokenOptions = Readonly<{
  username: string;
  title: string;
}>;

export class AuthToken implements AuthTokenAttributes {
  public readonly username: string;
  public readonly title: string;
  public readonly hash: Buffer;
  public readonly salt: Buffer;
  public readonly iterations: number;
  public readonly createdAt: Date;

  constructor(attrs: AuthTokenAttributes) {
    this.username = attrs.username;
    this.title = attrs.title;
    this.hash = attrs.hash;
    this.salt = attrs.salt;
    this.iterations = attrs.iterations;
    this.createdAt = attrs.createdAt;
  }

  public static async create(
    attrs: NewAuthTokenOptions,
  ): Promise<[AuthToken, string]> {
    const plaintext = randomBytes(PLAINTEXT_TOKEN_LEN);

    const salt = randomBytes(PBKDF2_SALT_LEN);
    const iterations = PBKDF2_ITERATIONS;
    const hash = await promisify(pbkdf2)(
      plaintext,
      salt,
      iterations,
      PBKDF2_OUTPUT_LEN,
      PBKDF2_HASH_ALGO,
    );

    const plaintextToken = [
      salt.toString('base64'),
      plaintext.toString('base64'),
    ].join(':');

    return [new AuthToken({
      ...attrs,
      salt,
      iterations,
      hash,
      createdAt: new Date(),
    }), plaintextToken];
  }

  public toColumns(): AuthTokenColumns {
    return {
      ...this,
      createdAt: this.createdAt.getTime(),
    };
  }

  public static fromColumns({
    createdAt,
    ...attributes
  }: AuthTokenColumns): AuthToken {
    return new AuthToken({
      createdAt: new Date(createdAt),
      ...attributes,
    });
  }

  public async authenticate(plaintext: Buffer): Promise<boolean> {
    const supplied = await promisify(pbkdf2)(
      plaintext,
      this.salt,
      this.iterations,
      PBKDF2_OUTPUT_LEN,
      PBKDF2_HASH_ALGO,
    );

    return timingSafeEqual(supplied, this.hash);
  }
}
