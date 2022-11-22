export type OutboxJobAttributes = Readonly<{
  id: number;
  actor: string;
  target: URL;
  data: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}>;

export type OutboxJobColumns = Omit<
  OutboxJobAttributes,
  'data' | 'target' | 'createdAt'
> & Readonly<{
  data: string;
  target: string;
  createdAt: number;
}>;

export class OutboxJob {
  public readonly id: number;
  public readonly actor: string;
  public readonly target: URL;
  public readonly data: Record<string, unknown>;
  public readonly attempts: number;
  public readonly createdAt: Date;

  constructor(attributes: OutboxJobAttributes) {
    this.id = attributes.id;
    this.actor = attributes.actor;
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
      target: this.target.toString(),
      createdAt: this.createdAt.getTime(),
      data: JSON.stringify(this.data),
    };
  }

  public static fromColumns({
    target,
    createdAt,
    data,

    ...attributes
  }: OutboxJobColumns): OutboxJob {
    return new OutboxJob({
      target: new URL(target),
      createdAt: new Date(createdAt),
      data: JSON.parse(data),
      ...attributes,
    });
  }
}
