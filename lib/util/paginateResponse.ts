import type { FastifyRequest, FastifyReply } from 'fastify';

import type { Paginated } from '../db.js';

export type PaginateOptions = Readonly<{
  url: URL;
  summary: string;
  getData(page?: number): Promise<Paginated<URL>>;
}>;

export type PaginateReply = Readonly<{
  error: string;
} | {
  '@context': 'https://www.w3.org/ns/activitystreams';
  id: URL;
  type: 'OrderedCollection' | 'OrderedCollectionPage';
  summary?: string;
  totalItems: number;
  partOf?: URL;
  first?: URL;
  current?: URL;
  next?: URL;
  orderedItems?: ReadonlyArray<URL>;
}>;

export async function paginateResponse(
  request: FastifyRequest<{ Querystring: { page?: string } }>,
  reply: FastifyReply,
  { url, summary, getData } : PaginateOptions,
): Promise<PaginateReply> {
  const { page: pageString } = request.query;

  let page: number | undefined;
  let nextPage = 1;

  let dbPage: number | undefined;
  if (pageString && typeof pageString === 'string') {
    page = parseInt(pageString, 10);
    if (page.toString() !== pageString) {
      reply.status(400);
      return { error: 'Invalid page' };
    }

    if (page < 1) {
      reply.status(400);
      return { error: 'Invalid page' };
    }

    // To be returned to requestor
    nextPage = page + 1;

    // Zero-based internal indexing
    dbPage = page - 1;
  }

  const {
    totalRows,
    rows,
    hasMore,
    pages,
  } = await getData(dbPage);

  if (page === undefined) {
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url,
      type: 'OrderedCollection',
      summary,
      totalItems: totalRows,
      first: pages > 0 ? new URL('?page=1', url) : undefined,
      current: pages > 0 ?
        new URL(`?page=${pages}`, url) :
        undefined,
    };
  }

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: new URL(`?page=${page}`, url),
    type: 'OrderedCollectionPage',
    totalItems: totalRows,
    partOf: url,
    next: hasMore ? new URL(`?page=${nextPage}`, url) : undefined,
    orderedItems: rows,
  };
}
