import type { FastifyRequest, FastifyReply } from 'fastify';

import type { Paginated } from '../db.js';
import type {
  OrderedCollection,
  OrderedCollectionPage,
  UnknownObject,
} from '../schemas/activityPub.js';

export type PaginateReply = OrderedCollection | OrderedCollectionPage;

export type PaginateOptions<Item extends UnknownObject | URL> = Readonly<{
  url: URL;
  summary: string;
  getData(page?: number): Promise<Paginated<Item>>;
}>;

export async function paginateResponse<Item extends UnknownObject | URL>(
  request: FastifyRequest<{ Querystring: { page?: string } }>,
  reply: FastifyReply,
  { url, summary, getData } : PaginateOptions<Item>,
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
    totalItems,
    items,
    hasMore,
  } = await getData(dbPage);

  if (page === undefined) {
    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: url.toString(),
      type: 'OrderedCollection',
      summary,
      totalItems: totalItems,
      first: totalItems > 0 ? new URL('?page=1', url).toString() : undefined,
    };
  }

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: new URL(`?page=${page}`, url).toString(),
    type: 'OrderedCollectionPage',
    totalItems: totalItems,
    partOf: url.toString(),
    next: hasMore ? new URL(`?page=${nextPage}`, url).toString() : undefined,
    orderedItems: items?.slice(),
  };
}
