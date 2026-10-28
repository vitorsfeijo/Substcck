import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../data/database.js';
import type { AuthorizationAttempt, User } from '../models/auth.js';
import { createIdentityRepository } from './identity.js';

export const digestToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function createSessionRepository(db: Database) {
  const identities = createIdentityRepository(db);
  return {
    async create(user: User, ttlSeconds: number) {
      const token = newToken();
      const csrfToken = newToken();
      await db.query(
        'INSERT INTO auth_sessions (id_hash, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, $4)',
        [
          digestToken(token),
          user.id,
          csrfToken,
          new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        ],
      );
      return { token, csrfToken };
    },
    async find(token: string | undefined) {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const result = await db.query<{
        user_id: string;
        csrf_token: string;
        issuer: string;
      }>(
        'SELECT s.user_id, s.csrf_token, u.issuer FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP',
        [digestToken(token)],
      );
      const record = result.rows[0];
      if (!record) return null;
      const user = await identities.findById(record.user_id);
      return user
        ? { user, csrfToken: record.csrf_token, issuer: record.issuer }
        : null;
    },
    async revoke(token: string | undefined) {
      if (token)
        await db.query('DELETE FROM auth_sessions WHERE id_hash = $1', [
          digestToken(token),
        ]);
    },
    async createAttempt(): Promise<AuthorizationAttempt> {
      const attempt = {
        state: newToken(),
        nonce: newToken(),
        codeVerifier: newToken(),
      };
      await db.query(
        'INSERT INTO auth_attempts (state_hash, nonce, code_verifier, expires_at) VALUES ($1, $2, $3, $4)',
        [
          digestToken(attempt.state),
          attempt.nonce,
          attempt.codeVerifier,
          new Date(Date.now() + 300000).toISOString(),
        ],
      );
      return attempt;
    },
    async consumeAttempt(state: string) {
      const record = await db.query<{
        nonce: string;
        code_verifier: string;
        expires_at: Date | string;
      }>(
        'DELETE FROM auth_attempts WHERE state_hash = $1 RETURNING nonce, code_verifier, expires_at',
        [digestToken(state)],
      );
      const attempt = record.rows[0];
      if (!attempt || new Date(attempt.expires_at).getTime() <= Date.now())
        return null;
      return {
        state,
        nonce: attempt.nonce,
        codeVerifier: attempt.code_verifier,
      };
    },
    async prune() {
      await db.query(
        'DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP',
      );
      await db.query(
        'DELETE FROM auth_attempts WHERE expires_at <= CURRENT_TIMESTAMP',
      );
    },
  };
}
