export type Activity = Readonly<{
  id: string;
  type: string;
  actor: string;
  object: any;
}>;
