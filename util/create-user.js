import { readFileSync } from 'fs';
import { Database } from '../lib/db.js';
const db = new Database();
function maybeFile(name) {
    if (!name) {
        return undefined;
    }
    return readFileSync(name).toString();
}
db.createUser({
    name: process.argv[2],
    profileName: process.argv[3],
    summary: process.argv[4],
    privateKey: maybeFile(process.argv[5]),
    publicKey: maybeFile(process.argv[6]),
});
