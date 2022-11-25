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

const LDString = T.Union([
  T.String(),
  T.Array(T.String()),
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
  to: LDString,
  bto: LDString,
  cc: LDString,
  bcc: LDString,
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

export const LinkSchema = T.Union([
  T.String(),
  createObjectSchema(
    T.Literal('Link'),
    {
      rel: T.String(),
    },
    {
      href: T.String(),
    },
  )
]);

export type Link = Static<typeof LinkSchema>;

export function getLinkHref(link: Link): string {
  if (typeof link === 'string') {
    return link;
  }

  return link.href;
}

// TODO(indutny): make this generic on object
// Technically these can be objects, but we don't support that
const ObjectOrLink = LinkSchema;

const CommonCollectionProps = {
  totalItems: T.Number(),

  current: ObjectOrLink,
  first: ObjectOrLink,
  last: ObjectOrLink,
};

const CollectionProps = {
  ...CommonCollectionProps,

  items: T.Array(ObjectOrLink),
};

const CollectionPageProps = {
  partOf: ObjectOrLink,
  prev: ObjectOrLink,
  next: ObjectOrLink,
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

  orderedItems: T.Array(ObjectOrLink),
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
    following: T.String(),
    followers: T.String(),
  },
);

export type Actor = Static<typeof ActorSchema>;

export const ActorValidator = TypeCompiler.Compile(ActorSchema);

//
// Activities
//

const CommonActivityProps = {
  result: ObjectOrLink,
  origin: ObjectOrLink,
  instrument: ObjectOrLink,
};

const RequiredActivityProps = {
  object: ObjectOrLink,
  actor: ObjectOrLink,
};

export const ActivitySchema = createObjectSchema(
  ActivityTypeSchema,
  {
    ...CommonActivityProps,
    target: ObjectOrLink,
  },
  RequiredActivityProps,
);

export type Activity = Static<typeof ActivitySchema>;

const RequiredIntransitiveActivityProps = {
  object: ObjectOrLink,
  target: ObjectOrLink,
};

export const IntransitiveActivitySchema = createObjectSchema(
  IntransitiveActivityTypeSchema,
  {
    ...CommonActivityProps,
    actor: ObjectOrLink,
  },
  RequiredIntransitiveActivityProps,
);

export type IntransitiveActivity =
  Static<typeof IntransitiveActivitySchema>;

export const AnyActivitySchema = T.Union([
  ActivitySchema,
  IntransitiveActivitySchema,
]);

export type AnyActivity = Static<typeof AnyActivitySchema>;

export const AnyActivityValidator = TypeCompiler.Compile(AnyActivitySchema);
