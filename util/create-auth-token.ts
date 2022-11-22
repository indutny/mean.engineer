import { Database } from '../lib/db.js';
import { AuthToken } from '../lib/models/authToken.js';

const db = new Database();

const [token, plaintext] = await AuthToken.create({
  username: process.argv[2],
  title: process.argv[3],
});

await db.saveAuthToken(token);

console.log(plaintext);
