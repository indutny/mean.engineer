import assert from 'assert';
import sjson from 'secure-json-parse';

import {
  type UnknownObject,
  UnknownObjectValidator,
  isObjectPublic,
} from '../schemas/activityPub.js';

export type InboxObjectAttributes = Readonly<{
  url: URL;
  actor: URL;
  owner: URL;
  object: UnknownObject;
  isPublic: boolean;
  createdAt: Date;
}>;

export type NewInboxObjectAttributes = Omit<
  InboxObjectAttributes,
  'createdAt' | 'isPublic'
>;

export type InboxObjectColumns = Readonly<{
  url: string;
  actor: string;
  owner: string;
  json: string;
  isPublic: number;
  createdAt: number;
}>;

export class InboxObject {
  public readonly url: URL;
  public readonly owner: URL;
  public readonly actor: URL;
  public readonly object: UnknownObject;
  public readonly isPublic: boolean;
  public readonly createdAt: Date;

  constructor(attributes: InboxObjectAttributes) {
    this.url = attributes.url;
    this.owner = attributes.owner;
    this.actor = attributes.actor;
    this.object = attributes.object;
    this.isPublic = attributes.isPublic;
    this.createdAt = attributes.createdAt;
  }

  public toAttributes(): InboxObjectAttributes {
    return { ...this };
  }

  public toColumns(): InboxObjectColumns {
    return {
      ...this,
      url: this.url.toString(),
      owner: this.owner.toString(),
      actor: this.actor.toString(),
      json: JSON.stringify(this.object),
      isPublic: this.isPublic ? 1 : 0,
      createdAt: this.createdAt.getTime(),
    };
  }

  public static create(attributes: NewInboxObjectAttributes): InboxObject {
    return new InboxObject({
      ...attributes,
      isPublic: isObjectPublic(attributes.object),
      createdAt: new Date(),
    });
  }

  public static fromColumns({
    url,
    owner,
    actor,
    json,
    isPublic,
    createdAt,

    ...attributes
  }: InboxObjectColumns): InboxObject {
    const object = sjson.parse(json);
    assert(UnknownObjectValidator.Check(object), 'Invalid inbox object');

    return new InboxObject({
      url: new URL(url),
      owner: new URL(owner),
      actor: new URL(actor),
      object,
      isPublic: isPublic === 1,
      createdAt: new Date(createdAt),
      ...attributes,
    });
  }
}
