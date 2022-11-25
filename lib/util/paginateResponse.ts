import type { FastifyRequest, FastifyReply } from 'fastify';

import type { Paginated } from '../db.js';
import type {
  OrderedCollection,
  OrderedCollectionPage,
} from '../schemas/activityPub.js';

export type PaginateReply = OrderedCollection | OrderedCollectionPage;

export type PaginateOptions = Readonly<{
  url: URL;
  summary: string;
  getData(page?: number): Promise<Paginated<URL>>;
}>;

export async function paginateResponse(
  request: FastifyRequest<{ Querystring: { page?: string } }>,
  reply: FastifyReply,
  { url, summary, getData } : PaginateOptions,
): Promise<PaginateReply | void> {
  const { page: pageString } = request.query;

  let page: number | undefined;
  let nextPage = 1;

  let dbPage: number | undefined;
  if (pageString && typeof pageString === 'string') {
    page = parseInt(pageString, 10);
    if (page.toString() !== pageString) {
      return reply.badRequest('Invalid page');
    }

    if (page < 1) {
      return reply.badRequest('Invalid page');
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
  } = await getData(dbPage);

  if (page === undefined) {
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url.toString(),
      type: 'OrderedCollection',
      summary,
      totalItems: totalRows,
      first: totalRows > 0 ? new URL('?page=1', url) : undefined,
    };
  }

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: new URL(`?page=${page}`, url).toString(),
    type: 'OrderedCollectionPage',
    totalItems: totalRows,
    partOf: url.toString(),
    next: hasMore ? new URL(`?page=${nextPage}`, url).toString() : undefined,
    orderedItems: rows?.map(row => row.toString()),
  };
}
