import type { Request, Response } from 'express';

import type { Paginated } from '../db.js';

export type PaginateOptions = Readonly<{
  url: URL;
  summary: string;
  getData(page?: number): Promise<Paginated<URL>>;
}>;

export async function paginate(
  req: Request,
  res: Response,
  { url, summary, getData } : PaginateOptions,
): Promise<void> {
  const { page: pageString } = req.query;

  let page: number | undefined;
  let nextPage = 1;

  let dbPage: number | undefined;
  if (pageString && typeof pageString === 'string') {
    page = parseInt(pageString, 10);
    if (page.toString() !== pageString) {
      res.status(400).send({ error: 'Invalid page' });
      return;
    }

    if (page < 1) {
      res.status(400).send({ error: 'Invalid page' });
      return;
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
    res.status(200).type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      summary,
      totalItems: totalRows,
      first: totalRows > 0 ? new URL('?page=1', url) : undefined,
    });
    return;
  }

  res.status(200).type('application/activity+json').send({
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: page === undefined ? url : new URL(`?page=${page}`, url),
    type: 'OrderedCollectionPage',
    totalItems: totalRows,
    partOf: url,
    next: hasMore ? new URL(`?page=${nextPage}`, url) : undefined,
    orderedItems: rows,
  });
}
