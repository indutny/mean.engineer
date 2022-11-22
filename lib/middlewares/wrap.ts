import type { Request, Response, NextFunction } from 'express';

export type Handler<
  Req extends Request,
  Res extends Response,
  Rest extends Array<unknown>,
  Ret
> = (
  req: Req,
  res: Res,
  next: NextFunction,
  ...rest: Rest
) => Ret;

export function wrap<
  Req extends Request,
  Res extends Response,
  Rest extends Array<unknown>,
  H extends Handler<Req, Res, Rest, Promise<void>> =
   Handler<Req, Res, Rest, Promise<void>>
>(
  handler: H
): Handler<Req, Res, Rest, void> {
  async function run(
    req: Req,
    res: Res,
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
