import type { Request, Response, NextFunction } from 'express';

export type AsyncHandler<Rest extends Array<unknown>> = (
  req: Request,
  res: Response,
  next: NextFunction,
  ...rest: Rest
) => Promise<void>;

export type Handler<Rest extends Array<unknown>> = (
  req: Request,
  res: Response,
  next: NextFunction,
  ...rest: Rest
) => void;

export function wrap<Rest extends Array<unknown>>(
  handler: AsyncHandler<Rest>,
): Handler<Rest> {
  async function run(
    req: Request,
    res: Response,
    next: NextFunction,
    ...rest: Rest
  ): Promise<void> {
    try {
      await handler(req, res, next, ...rest);
    } catch (error) {
      res.status(500).send({ error: error.stack });
    }
  }
  return (req, res, next, ...rest) => {
    run(req, res, next, ...rest);
  };
}
