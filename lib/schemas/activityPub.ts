import assert from 'assert';
import {
  Static,
  Type as T,
  type TSchema,
  type TProperties,
} from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

//
// Utilities
//

const MaybeArray = <Schema extends TSchema>(schema: Schema) => T.Union([
  schema,
  T.Array(schema),
]);

//
// Enums
//

export const ActivityTypeSchema = T.Union([
  // Core types
  T.Literal('Activity'),

  // Types
  T.Literal('Accept'),
  T.Literal('Add'),
  T.Literal('Announce'),
  T.Literal('Block'),
  T.Literal('Create'),
  T.Literal('Delete'),
  T.Literal('Dislike'),
  T.Literal('Flag'),
  T.Literal('Follow'),
  T.Literal('Ignore'),
  T.Literal('Invite'),
  T.Literal('Join'),
  T.Literal('Leave'),
  T.Literal('Like'),
  T.Literal('Listen'),
  T.Literal('Move'),
  T.Literal('Offer'),
  T.Literal('Reject'),
  T.Literal('Read'),
  T.Literal('Remove'),
  T.Literal('TentativeReject'),
  T.Literal('TentativeAccept'),
  T.Literal('Undo'),
  T.Literal('Update'),
  T.Literal('View'),
]);

export type ActivityType = Static<typeof ActivityTypeSchema>;

export const IntransitiveActivityTypeSchema = T.Union([
  // Core types
  T.Literal('IntransitiveActivity'),

  // Types
  T.Literal('Arrive'),
  T.Literal('Question'),
  T.Literal('Travel'),
]);

export const SupportedActivitySchema = T.Union([
  T.Literal('Follow'),
  T.Literal('Undo'),
]);

export const ActorTypeSchema = T.Union([
  T.Literal('Application'),
  T.Literal('Group'),
  T.Literal('Organization'),
  T.Literal('Person'),
  T.Literal('Service'),
]);

export type ActorType = Static<typeof ActorTypeSchema>;

export const ObjectTypeSchema = T.Union([
  // Core types
  T.Literal('Object'),
  T.Literal('Collection'),
  T.Literal('OrderedCollection'),
  T.Literal('CollectionPage'),
  T.Literal('OrderedCollectionPage'),

  // Types
  T.Literal('Article'),
  T.Literal('Audio'),
  T.Literal('Document'),
  T.Literal('Event'),
  T.Literal('Image'),
  T.Literal('Note'),
  T.Literal('Page'),
  T.Literal('Place'),
  T.Literal('Profile'),
  T.Literal('Relationship'),
  T.Literal('Tombstone'),
  T.Literal('Video'),
]);

export type ObjectType = Static<typeof ObjectTypeSchema>;

export const LinkTypeSchema = T.Literal('Mention');

export type LinkType = Static<typeof LinkTypeSchema>;

//
// Common types
//

export const LinkSchema = MaybeArray(T.Union([
  T.String(),
  T.Object({
    type: T.Optional(T.String()),
    id: T.Optional(T.String()),
    href: T.Optional(T.String()),
  }),
]));

export type Link = Static<typeof LinkSchema>;

//
// Objects
//

const ObjectProps = {
  '@context': T.Unknown(),
  id: T.String(),
  name: T.String(),
  summary: T.String(),
  content: T.String(),
  published: T.String(),
  mediaType: T.String(),
  to: LinkSchema,
  bto: LinkSchema,
  cc: LinkSchema,
  bcc: LinkSchema,
  audience: LinkSchema,
  tag: LinkSchema,
};

function createObjectSchema<
  Type extends TSchema,
  Props extends TProperties,
  RequiredProps extends TProperties,
>(type: Type, props: Props, requiredProps: RequiredProps) {
  return T.Intersect([
    T.Object({ type, ...requiredProps }),
    T.Partial(T.Object({
      ...ObjectProps,
      ...props,
    })),
  ]);
}

export const UnknownObjectSchema = createObjectSchema(T.Optional(T.String()), {
}, {});

export type UnknownObject = Static<typeof UnknownObjectSchema>;

export const UnknownObjectValidator = TypeCompiler.Compile(UnknownObjectSchema);

export function isObjectPublic(object: UnknownObject): boolean {
  const { to, cc, audience } = object;
  return [to, cc, audience].flat().some(x => x === 'as:Public');
}

export function getLinkURL(link: Link): URL {
  if (Array.isArray(link)) {
    throw new Error('Link must not be an array');
  }

  if (typeof link === 'string') {
    return new URL(link);
  }

  if (link.type === 'Link' || link.type === 'Mention') {
    assert(link.href, 'Link must have a href');
    return new URL(link.href);
  }

  assert(link.id, `Object must have an id (type: ${link.type})`);
  return new URL(link.id);
}

const ObjectOrLink = <Value extends TSchema>(value: Value) => T.Union([
  LinkSchema,
  value,
]);

const CommonCollectionProps = {
  totalItems: T.Number(),

  // Technically these can be objects, but we don't support that
  current: LinkSchema,
  first: LinkSchema,
  last: LinkSchema,
};

const CollectionProps = {
  ...CommonCollectionProps,

  items: T.Array(ObjectOrLink(UnknownObjectSchema)),
};

const CollectionPageProps = {
  // Technically these can be objects, but we don't support that
  partOf: LinkSchema,
  prev: LinkSchema,
  next: LinkSchema,
};

export const CollectionSchema = createObjectSchema(
  T.Literal('Collection'),
  CollectionProps,
  {},
);

export type Collection = Static<typeof CollectionSchema>;

export const CollectionPageSchema = createObjectSchema(
  T.Literal('CollectionPage'),
  {
    ...CollectionProps,
    ...CollectionPageProps,
  },
  {},
);

export type CollectionPage = Static<typeof CollectionPageSchema>;

const OrderedCollectionProps = {
  ...CommonCollectionProps,

  orderedItems: T.Array(ObjectOrLink(UnknownObjectSchema)),
};

export const OrderedCollectionSchema = createObjectSchema(
  T.Literal('OrderedCollection'),
  OrderedCollectionProps,
  {},
);

export type OrderedCollection = Static<typeof OrderedCollectionSchema>;

export const OrderedCollectionPageSchema = createObjectSchema(
  T.Literal('OrderedCollectionPage'),
  {
    ...OrderedCollectionProps,
    ...CollectionPageProps,
  },
  {}
);

export type OrderedCollectionPage = Static<typeof OrderedCollectionPageSchema>;

export const ActorSchema = createObjectSchema(
  ActorTypeSchema,
  {
    following: T.String(),
    followers: T.String(),
    preferredUsername: T.String(),
    endpoints: T.Partial(T.Object({
      sharedInbox: T.String(),
    })),
    publicKey: T.Object({
      id: T.String(),
      owner: T.String(),
      publicKeyPem: T.String(),
    }),
    liked: T.String(),
  },
  {
    inbox: T.String(),
    outbox: T.String(),
  },
);

export type Actor = Static<typeof ActorSchema>;

export const ActorValidator = TypeCompiler.Compile(ActorSchema);

//
// Activities
//

const CommonActivityProps = {
  result: ObjectOrLink(UnknownObjectSchema),
  origin:  ObjectOrLink(UnknownObjectSchema),
  instrument:  ObjectOrLink(UnknownObjectSchema),
};

export const CreateSchema = createObjectSchema(
  T.Literal('Create'),
  CommonActivityProps,
  {
    actor: LinkSchema,
    object: UnknownObjectSchema,
  },
);

export type Create = Static<typeof CreateSchema>;

// Clients submitting the following activities to an outbox MUST provide the
// object property in the activity: Create, Update, Delete, Follow, Add, Remove,
// Like, Block, Undo.

export const FollowSchema = createObjectSchema(
  T.Literal('Follow'),
  CommonActivityProps,
  {
    actor: LinkSchema,
    object: LinkSchema,
  },
);

export type Follow = Static<typeof FollowSchema>;

export const UndoSchema = createObjectSchema(
  T.Literal('Undo'),
  CommonActivityProps,
  {
    actor: LinkSchema,
    object: FollowSchema,
  },
);

export type Undo = Static<typeof UndoSchema>;

// Only supported activities go here.
export const ActivitySchema = T.Union([
  CreateSchema,
  FollowSchema,
  UndoSchema,
]);

export type Activity = Static<typeof ActivitySchema>;

export const ActivityValidator = TypeCompiler.Compile(ActivitySchema);
