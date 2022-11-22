import {
  randomBytes,
  pbkdf2,
  generateKeyPairSync,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

import { BASE_URL } from '../config.js';

const PBKDF2_ITERATIONS = 10000;
const HASH_LENGTH = 32;
const RSA_SIZE = 2048;

export interface UserAttributes {
  username: string;
  passwordHash: Buffer;
  passwordSalt: Buffer;
  passwordIterations: number;
  privateKey: string;
  publicKey: string;
  createdAt: Date;

  profileName: string;
  about: string;
}

export type UserColumns = Omit<UserAttributes, 'createdAt'> & Readonly<{
  createdAt: number;
}>;

export type NewUserOptions = Readonly<{
  username: string;
  password: string;
  profileName: string;
  about: string;
}>;

export class User implements UserAttributes {
  public readonly username: string;
  public readonly passwordHash: Buffer;
  public readonly passwordSalt: Buffer;
  public readonly passwordIterations: number;
  public readonly privateKey: string;
  public readonly publicKey: string;
  public readonly createdAt: Date;
  public readonly profileName: string;
  public readonly about: string;

  constructor(attrs: UserAttributes) {
    this.username = attrs.username;
    this.passwordHash = attrs.passwordHash;
    this.passwordSalt = attrs.passwordSalt;
    this.passwordIterations = attrs.passwordIterations;
    this.privateKey = attrs.privateKey;
    this.publicKey = attrs.publicKey;
    this.createdAt = attrs.createdAt;
    this.profileName = attrs.profileName;
    this.about = attrs.about;
  }

  public static async create({
    password,
    ...attrs
  }: NewUserOptions): Promise<User> {
    const passwordSalt = randomBytes(16);
    const passwordIterations = PBKDF2_ITERATIONS;
    const passwordHash = await promisify(pbkdf2)(
      password,
      passwordSalt,
      passwordIterations,
      HASH_LENGTH,
      'sha256',
    );

    return new User({
      ...attrs,
      passwordSalt,
      passwordIterations,
      passwordHash,
      ...generateKeyPairSync('rsa', {
        modulusLength: RSA_SIZE,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }),
      createdAt: new Date(),
    });
  }

  public getURL(): URL {
    return new URL(`./users/${this.username}`, BASE_URL);
  }

  public toColumns(): UserColumns {
    return {
      ...this,
      createdAt: this.createdAt.getTime(),
    };
  }

  public static fromColumns({
    createdAt,
    ...attributes
  }: UserColumns): User {
    return new User({
      createdAt: new Date(createdAt),
      ...attributes,
    });
  }

  public async authenticate(password: string): Promise<boolean> {
    const supplied = await promisify(pbkdf2)(
      password,
      this.passwordSalt,
      this.passwordIterations,
      HASH_LENGTH,
      'sha256',
    );

    return timingSafeEqual(supplied, this.passwordHash);
  }
}
