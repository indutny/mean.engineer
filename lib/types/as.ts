export const ACTOR_TYPES: ReadonlySet<string> = new Set([
  'Application',
  'Group',
  'Organization',
  'Person',
  'Service',
]);

export type Activity = Readonly<{
  id: string;
  type: string;
  actor: string;
  object: any;
  to?: string | Readonly<string>;
  bto?: string | Readonly<string>;
  cc?: string | Readonly<string>;
  bcc?: string | Readonly<string>;
}>;
