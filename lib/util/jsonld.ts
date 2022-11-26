import { readFileSync } from 'fs';
import sjson from 'secure-json-parse';
import * as badJSONLD from 'jsonld';
import createDebug from 'debug';

const debug = createDebug('me:jsonld');

// Sadly types for JSONLD are really off.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonld = (badJSONLD as any).default;

function json(file: string): unknown {
  const url = new URL(`../../contexts/${file}`, import.meta.url);
  const content = readFileSync(url);
  return sjson.parse(content.toString());
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
  try {
    return await jsonld.compact(doc, Array.from(CONTEXT_MAP.keys()), {
      documentLoader,
    });
  } catch (error) {
    debug('Failed to parse incoming document %O', doc);
    throw error;
  }
}
