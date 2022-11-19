import * as jsonld from 'jsonld';

export async function compact(data: unknown): Promise<unknown> {
  return jsonld.compact(data);
}
