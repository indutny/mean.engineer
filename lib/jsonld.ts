import * as badJSONLD from 'jsonld';
import AS_CONTEXT from './contexts/as.js';
import SEC_CONTEXT from './contexts/sec.js';

const jsonld = (badJSONLD as any).default;

const AS_URL = 'https://www.w3.org/ns/activitystreams';
const SEC_URL = 'https://w3id.org/security/v1';

async function documentLoader(url: string): Promise<unknown> {
  if (url === AS_URL) {
    return { contextUrl: null, document: AS_CONTEXT, documentUrl: null };
  }

  if (url === SEC_URL) {
    return { contextUrl: null, document: SEC_CONTEXT, documentUrl: null };
  }

  // No online lookups!
  return { contextUrl: null, document: { '@context': {} }, documentUrl: null };
}

export async function compact(doc: unknown): Promise<unknown> {
  return jsonld.compact(doc, [AS_URL, SEC_URL], {
    documentLoader,
  });
}
