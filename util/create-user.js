import { Database } from '../lib/db.js';
const db = new Database();
db.createUser({
    name: process.argv[2],
    profileName: process.argv[3],
    summary: process.argv[4],
});
