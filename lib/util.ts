import { BASE_URL } from './config.js';
import type { User } from './db.js';

export function getLocalUserURL(user: User): string {
  return `${BASE_URL}/users/${user.name}`;
}
