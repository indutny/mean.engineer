import * as badJSONLD from 'jsonld';
import AS_CONTEXT from './contexts/as.js';

const jsonld = (badJSONLD as any).default;

const AS_URL = 'https://www.w3.org/ns/activitystreams';

async function documentLoader(url: string): Promise<unknown> {
  if (url === AS_URL) {
    return { contextUrl: null, document: AS_CONTEXT, documentUrl: null };
  }

  // No online lookups!
  return { contextUrl: null, document: { '@context': {} }, documentUrl: null };
}

export async function compact(doc: unknown): Promise<unknown> {
  return jsonld.compact(doc, AS_URL, {
    documentLoader,
  });
}
