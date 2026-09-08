import { createHash, randomBytes } from 'node:crypto';

export function hashInvitationToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}
