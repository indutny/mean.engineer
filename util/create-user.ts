import { Database } from '../lib/db.js';
import { User } from '../lib/models/user.js';

const db = new Database();

await db.saveUser(await User.create({
  username: process.argv[2],
  password: process.argv[3],
  profileName: process.argv[4],
  about: process.argv[5],
}));
