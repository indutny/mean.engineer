import { randomBytes } from 'crypto';

const ID_LEN = 16;

export type OutboxJobAttributes = Readonly<{
  id: Buffer;
  actor: string;
  inbox: URL;
  data: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}>;

export type NewOutboxJobAttributes = Omit<
  OutboxJobAttributes,
  'id' | 'createdAt'
>;

export type OutboxJobColumns = Omit<
  OutboxJobAttributes,
  'data' | 'inbox' | 'createdAt'
> & Readonly<{
  data: string;
  inbox: string;
  createdAt: number;
}>;

export class OutboxJob {
  public readonly id: Buffer;
  public readonly actor: string;
  public readonly inbox: URL;
  public readonly data: Record<string, unknown>;
  public readonly attempts: number;
  public readonly createdAt: Date;

  constructor(attributes: OutboxJobAttributes) {
    this.id = attributes.id;
    this.actor = attributes.actor;
    this.inbox = attributes.inbox;
    this.data = attributes.data;
    this.attempts = attributes.attempts;
    this.createdAt = attributes.createdAt;
  }

  public getDebugId(): string {
    return this.id.toString('base64');
  }

  public toAttributes(): OutboxJobAttributes {
    return { ...this };
  }

  public toColumns(): OutboxJobColumns {
    return {
      ...this,
      inbox: this.inbox.toString(),
      createdAt: this.createdAt.getTime(),
      data: JSON.stringify(this.data),
    };
  }

  public static create(attributes: NewOutboxJobAttributes): OutboxJob {
    return new OutboxJob({
      ...attributes,
      id: randomBytes(ID_LEN),
      createdAt: new Date(),
    });
  }

  public static fromColumns({
    inbox,
    createdAt,
    data,

    ...attributes
  }: OutboxJobColumns): OutboxJob {
    return new OutboxJob({
      inbox: new URL(inbox),
      createdAt: new Date(createdAt),
      data: JSON.parse(data),
      ...attributes,
    });
  }
}
