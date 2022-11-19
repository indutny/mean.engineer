import type { Application } from 'express';

import activityPub from './activity-pub.js';
import mastodon from './mastodon.js';
import webfinger from './webfinger.js';

export default (app: Application): void => {
  activityPub(app);
  mastodon(app);
  webfinger(app);
}
