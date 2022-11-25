import {
  Static,
  Type as T,
} from '@sinclair/typebox';

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

export const CoreTypeSchema = T.Union([
  T.Literal('Object'),
  T.Literal('Activity'),
  T.Literal('IntransitiveActivity'),
  T.Literal('Collection'),
  T.Literal('OrderedCollection'),
  T.Literal('CollectionPage'),
  T.Literal('OrderedCollectionPage'),
]);

export type CoreType = Static<typeof CoreTypeSchema>;

export const ActivityTypeSchema = T.Union([
  T.Literal('Accept'),
  T.Literal('Add'),
  T.Literal('Announce'),
  T.Literal('Arrive'),
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
  T.Literal('Question'),
  T.Literal('Reject'),
  T.Literal('Read'),
  T.Literal('Remove'),
  T.Literal('TentativeReject'),
  T.Literal('TentativeAccept'),
  T.Literal('Travel'),
  T.Literal('Undo'),
  T.Literal('Update'),
  T.Literal('View'),
]);

export type ActivityType = Static<typeof ActivityTypeSchema>;

export const ActorTypeSchema = T.Union([
  T.Literal('Application'),
  T.Literal('Group'),
  T.Literal('Organization'),
  T.Literal('Person'),
  T.Literal('Service'),
]);

export type ActorType = Static<typeof ActorTypeSchema>;

export const ObjectTypeSchema = T.Union([
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

export const UnknownObjectSchema = T.Partial(T.Object({
  ...ObjectProps,
  type: T.String(),
}));

export type UnknownObject = Static<typeof UnknownObjectSchema>;

export const LinkSchema = T.Union([
  T.String(),
  T.Partial(T.Object({
    ...ObjectProps,
    href: T.String(),
    rel: T.String(),
  })),
]);

export type Link = Static<typeof LinkSchema>;

const ObjectOrLink = T.Union([
  UnknownObjectSchema,
  LinkSchema,
]);

const CommonCollectionProps = {
  totalItems: T.Number(),

  // Technically these three can be pages, but we don't support that
  current: LinkSchema,
  first: LinkSchema,
  last: LinkSchema,
};

const CollectionProps = {
  ...CommonCollectionProps,

  items: T.Array(ObjectOrLink),
};

const CollectionPageProps = {
  // Technically these three can be pages, but we don't support that
  partOf: LinkSchema,
  prev: LinkSchema,
  next: LinkSchema,
};

export const CollectionSchema = T.Intersect([
  T.Object({
    type: T.Literal('Collection'),
  }),
  T.Partial(T.Object({
    ...ObjectProps,
    ...CollectionProps,
  })),
]);

export type Collection = Static<typeof CollectionSchema>;

export const CollectionPageSchema = T.Intersect([
  T.Object({
    type: T.Literal('CollectionPage'),
  }),
  T.Partial(T.Object({
    ...ObjectProps,
    ...CollectionProps,
    ...CollectionPageProps,
  })),
]);

export type CollectionPage = Static<typeof CollectionPageSchema>;

const OrderedCollectionProps = {
  ...CommonCollectionProps,

  orderedItems: T.Array(ObjectOrLink),
};

export const OrderedCollectionSchema = T.Intersect([
  T.Object({
    type: T.Literal('OrderedCollection'),
  }),
  T.Partial(T.Object({
    ...ObjectProps,
    ...OrderedCollectionProps,
  })),
]);

export type OrderedCollection = Static<typeof OrderedCollectionSchema>;

export const OrderedCollectionPageSchema = T.Intersect([
  T.Object({
    type: T.Literal('OrderedCollectionPage'),
  }),
  T.Partial(T.Object({
    ...ObjectProps,
    ...OrderedCollectionProps,
    ...CollectionPageProps,
  })),
]);

export type OrderedCollectionPage = Static<typeof OrderedCollectionPageSchema>;
