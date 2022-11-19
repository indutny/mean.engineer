import express from 'express';
import fs from 'fs';

import setupRoutes from './routes/index.js';

const app = express();

app.use(express.json({
  type: ['application/json', 'application/activity+json'],
}));
app.use(express.urlencoded({ extended: false }));

app.all('*', function (req, res, next) {
  console.log(req.method, req.headers, req.url, req.body);
  next();
});

setupRoutes(app);

app.listen(8000, '127.0.0.1');
