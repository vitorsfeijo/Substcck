import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { createPlatformRepository } from './repositories/platform.js';
import { digestToken } from './repositories/sessions.js';
import { getDevelopmentIdentity } from './auth/development.js';
import type { IdentityAdapter } from './models/auth.js';

const origin = 'http://127.0.0.1:5173';
const config = readConfig({ NODE_ENV: 'test', AUTH_MODE: 'development' });
let db: Database;
beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
});
beforeEach(async () => {
  await db.exec('DELETE FROM auth_sessions; DELETE FROM auth_attempts;');
});
afterAll(async () => {
  await db.close();
});
const buildApp = () =>
  createApp(config, createPlatformRepository(db), { database: db });

describe('session and access boundaries', () => {
  it('rejects anonymous access, foreign origins and forged credentials', async () => {
    const app = await buildApp();
    try {
      expect((await app.inject('/api/auth/config')).json().mode).toBe(
        'development',
      );
      expect((await app.inject('/api/auth/session')).json().user).toBeNull();
      expect((await app.inject('/api/me')).statusCode).toBe(401);
      expect((await app.inject('/api/me/tccs')).statusCode).toBe(401);
      for (const headers of [{}, { origin: 'https://attacker.invalid' }]) {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/development',
              headers,
              payload: { persona: 'author' },
            })
          ).statusCode,
        ).toBe(403);
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/development',
            headers: { origin },
            payload: { persona: 'administrator' },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            url: '/api/me',
            headers: {
              authorization: 'Bearer arbitrary',
              cookie: 'subtccstack_session=forged',
            },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('stores opaque hashed sessions, rotates login and requires CSRF for logout', async () => {
    const app = await buildApp();
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/auth/development',
        headers: { origin },
        payload: { persona: 'author', role: 'professor', userId: 'forged' },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().user.role).toBe('student');
      const oldCookie = String(first.headers['set-cookie']).split(';')[0];
      expect(first.headers['set-cookie']).toMatch(/HttpOnly/);
      expect(first.headers['set-cookie']).toMatch(/SameSite=Lax/);
      const rawToken = oldCookie.split('=')[1];
      const rows = await db.query('SELECT id_hash FROM auth_sessions');
      expect(rows.rows[0]?.id_hash).toBe(digestToken(rawToken));
      expect(first.body).not.toContain(rawToken);
      const next = await app.inject({
        method: 'POST',
        url: '/api/auth/development',
        headers: { origin, cookie: oldCookie },
        payload: { persona: 'author' },
      });
      const cookie = String(next.headers['set-cookie']).split(';')[0];
      expect(cookie).not.toBe(oldCookie);
      expect(
        (await app.inject({ url: '/api/me', headers: { cookie: oldCookie } }))
          .statusCode,
      ).toBe(401);
      const session = await app.inject({
        url: '/api/auth/session',
        headers: { cookie },
      });
      expect(session.json().user.id).toBe(first.json().user.id);
      expect(session.headers['cache-control']).toBe('no-store');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: { origin, cookie },
          })
        ).statusCode,
      ).toBe(403);
      const csrfToken = session.json().csrfToken as string;
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: {
              origin: 'https://attacker.invalid',
              cookie,
              'x-csrf-token': csrfToken,
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/logout',
            headers: { origin, cookie, 'x-csrf-token': csrfToken },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ url: '/api/me', headers: { cookie } })).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('expires sessions and separates professor permissions', async () => {
    const app = await buildApp();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/development',
        headers: { origin },
        payload: { persona: 'professor' },
      });
      const cookie = String(login.headers['set-cookie']).split(';')[0];
      expect(
        (await app.inject({ url: '/api/me', headers: { cookie } })).json().user
          .role,
      ).toBe('professor');
      expect(
        (await app.inject({ url: '/api/me/tccs', headers: { cookie } }))
          .statusCode,
      ).toBe(403);
      await db.exec(
        "UPDATE auth_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'",
      );
      expect(
        (await app.inject({ url: '/api/me', headers: { cookie } })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({ url: '/api/auth/session', headers: { cookie } })
        ).json().user,
      ).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('keeps authentication disabled unless explicitly enabled and refuses remote simulation', async () => {
    const disabled = await createApp(
      readConfig({ NODE_ENV: 'test' }),
      createPlatformRepository(db),
      { database: db },
    );
    try {
      expect((await disabled.inject('/api/auth/config')).json()).toEqual({
        mode: 'disabled',
        loginUrl: null,
      });
      expect(
        (
          await disabled.inject({
            method: 'POST',
            url: '/api/auth/development',
            payload: { persona: 'author' },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await disabled.close();
    }
    for (const env of [
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://example/db',
        CORS_ORIGINS: origin,
      },
      { HOST: '0.0.0.0' },
      { CORS_ORIGINS: 'https://vitorsfeijo.github.io' },
      { FRONTEND_URL: 'https://example.com' },
      { PUBLIC_API_URL: 'https://api.example.com/api' },
    ])
      expect(() => readConfig({ AUTH_MODE: 'development', ...env })).toThrow(
        /local/,
      );
  });
});

it('binds OIDC callback to its browser attempt and prevents replay', async () => {
  const oidcConfig = readConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'oidc',
    FRONTEND_URL: 'https://frontend.example/app/',
    PUBLIC_API_URL: 'https://api.example/api',
    CORS_ORIGINS: 'https://frontend.example',
    OIDC_ISSUER: 'https://identity.example',
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'test-only',
    OIDC_REDIRECT_URI: 'https://api.example/api/auth/callback',
  });
  let callbacks = 0;
  const adapter: IdentityAdapter = {
    async authorizationUrl(attempt) {
      const url = new URL('https://identity.example/authorize');
      url.searchParams.set('state', attempt.state);
      return url;
    },
    async callback(_url, attempt) {
      callbacks++;
      expect(attempt.codeVerifier.length).toBe(43);
      return {
        ...getDevelopmentIdentity('author'),
        issuer: 'https://identity.example',
      };
    },
  };
  const app = await createApp(oidcConfig, createPlatformRepository(db), {
    database: db,
    identityAdapter: adapter,
  });
  try {
    const login = await app.inject('/api/auth/login');
    const state = new URL(String(login.headers.location)).searchParams.get(
      'state',
    );
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const url = `/api/auth/callback?state=${state}&code=provider-code`;
    expect((await app.inject(url)).statusCode).toBe(401);
    const valid = await app.inject({ url, headers: { cookie } });
    expect(valid.statusCode).toBe(302);
    expect(valid.headers.location).toBe(
      'https://frontend.example/app/#/perfil',
    );
    expect(callbacks).toBe(1);
    expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(
      401,
    );
    expect(callbacks).toBe(1);
    const cookies = valid.headers['set-cookie'];
    const sessionCookie = (Array.isArray(cookies) ? cookies : [String(cookies)])
      .find((value) => value.startsWith('subtccstack_session='))!
      .split(';')[0];
    expect(
      (await app.inject({ url: '/api/me', headers: { cookie: sessionCookie } }))
        .statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
