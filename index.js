import express from 'express';
import fs from 'fs';

const CONFIG = JSON.parse(fs.readFileSync('config.json').toString());

const {
  host: HOST,
} = CONFIG;

const BASE_URL = `https://${HOST}`;

const app = express();

app.use(express.json());

app.all('*', function (req, res, next) {
  console.log(req.method, req.headers, req.url, req.body);
  next();
});

app.get('/.well-known/webfinger', (req, res) => {
  const { resource = '' } = req.query;
  const accountMatch = resource.match(/^acct:(.*)@(.*)$/);
  if (!accountMatch) {
    res.status(404).send({ error: 'Not found' });
    return;
  }

  const [, account, accountHost] = accountMatch;
  if (accountHost !== HOST) {
    res.status(404).send({ error: 'Not found' });
    return;
  }

  res.send({
    subject: resource,
    aliases: [
      `${BASE_URL}/@${account}`,
      `${BASE_URL}/users/${account}`
    ],
    links: [
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `${BASE_URL}/@${account}`,
      },
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `${BASE_URL}/users/${account}`
      },
      {
        rel: 'http://ostatus.org/schema/1.0/subscribe',
        // TODO(indutny): support this
        template: `${BASE_URL}/authorize_interaction?uri={uri}`
      }
    ]
  });
});

app.listen(8000, '127.0.0.1');
