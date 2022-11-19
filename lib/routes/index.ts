import type { Application } from 'express';

import mastodon from './mastodon.js';
import webfinger from './webfinger.js';
import users from './users.js';

export default (app: Application): void => {
  app.use('/api/v1', mastodon());
  app.use('/.well-known', webfinger());
  app.use('/users', users());
}
