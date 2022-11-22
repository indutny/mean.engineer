import type {  RequestHandler } from 'express';

import type { Database } from '../db.js';
import { type AuthToken } from '../models/authToken.js';
import { User } from '../models/user.js';
import { wrap } from './wrap.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}


export function auth(db: Database): RequestHandler {
  return wrap(async (req, res, next) => {
    const header = req.get('authorization');
    if (!header) {
      next();
      return;
    }

    const match = header.match(/^Bearer\s+([^\s]*):([^\s]*)$/);
    if (!match) {
      res.status(400).send({ error: 'Invalid Authorization header' });
      return;
    }

    let isValid = false;
    let token: AuthToken | undefined;
    try {
      const salt = Buffer.from(match[1], 'base64');
      const plaintext = Buffer.from(match[2], 'base64');

      token = await db.loadAuthToken(salt);
      if (!token) {
        res.status(403).send({ error: 'Incorrect token' });
        return;
      }

      isValid = await token.authenticate(plaintext);
    } catch (error) {
      res.status(400).send({ error: 'Bad token' });
      return;
    }

    if (isValid) {
      req.user = await db.loadUser(token.username);
      if (!req.user) {
        res.status(403).send({ error: 'Incorrect token' });
        return;
      }
    }

    next();
  });
}
