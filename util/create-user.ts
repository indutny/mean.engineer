import { generateKeyPairSync } from 'crypto';

import { Database } from '../lib/db.js';

const db = new Database();

db.createUser({
  name: process.argv[2],
  profileName: process.argv[3],
  summary: process.argv[4],
  ...generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  }),
  createdAt: Date.now(),
});
