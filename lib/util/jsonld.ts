import { readFileSync } from 'fs';
import * as badJSONLD from 'jsonld';

// Sadly types for JSONLD are really off.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonld = (badJSONLD as any).default;

function json(file: string): unknown {
  const url = new URL(`../../contexts/${file}`, import.meta.url);
  const content = readFileSync(url);
  return JSON.parse(content.toString());
}

const CONTEXT_MAP = new Map<string, unknown>([
  ['https://www.w3.org/ns/activitystreams', json('activity-streams.json')],
  ['https://w3id.org/security/v1', json('security.json')],
  ['http://joinmastodon.org/ns', json('mastodon.json')],
]);

async function documentLoader(url: string): Promise<unknown> {
  const document = CONTEXT_MAP.get(url) ?? { '@context': {} };

  return { contextUrl: null, document, documentUrl: null };
}

export async function compact(doc: unknown): Promise<unknown> {
  return jsonld.compact(doc, Array.from(CONTEXT_MAP.keys()), {
    documentLoader,
  });
}
