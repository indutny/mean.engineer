import type { Request, Response } from 'express';

import type { Paginated } from '../db.js';

export type PaginateOptions = Readonly<{
  url: string;
  summary: string;
  getData(page?: number): Paginated<string>;
}>;

export function paginate(
  req: Request,
  res: Response,
  { url, summary, getData } : PaginateOptions,
): void {
  const { page: pageString } = req.query;

  let page: number | undefined;
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

    // Zero-based internal indexing
    page -= 1;
  }

  // TODO(indutny): pagination

  const {
    totalRows,
    rows,
    pageCount,
  } = getData(page);

  if (page === undefined) {
    res.status(200).type('application/activity+json').send({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'OrderedCollection',
      summary,
      totalItems: totalRows,
      first: totalRows > 0 ? `${url}?page=1` : undefined,
    });
    return;
  }

  res.status(200).type('application/activity+json').send({
    '@context': 'https://www.w3.org/ns/activitystreams',
    type: 'OrderedCollectionPage',
    totalItems: totalRows,
    partOf: url,
    next: rows.length > 0 ? `${url}?page=${page + 1}` : undefined,
    orderedItems: rows,
  });
}
