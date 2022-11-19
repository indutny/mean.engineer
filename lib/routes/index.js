import activityPub from './activity-pub.js';
import mastodon from './mastodon.js';
import webfinger from './webfinger.js';

export default (app) => {
  activityPub(app);
  mastodon(app);
  webfinger(app);
}
