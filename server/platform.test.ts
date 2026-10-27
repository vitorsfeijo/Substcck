import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';

describe('public health contract', () => {
  it('reports ready database, exact CORS origin, and offers no public writes', async () => {
    const config = readConfig({ NODE_ENV: 'test' });
    const app = await createApp(config, { isReady: async () => true });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { origin: 'http://127.0.0.1:5173' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        service: 'subtccstack-api',
        database: 'ok',
        environment: 'test',
      });
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://127.0.0.1:5173',
      );
      const foreign = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { origin: 'https://unknown.example' },
      });
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
      expect(
        (await app.inject({ method: 'POST', url: '/api/health' })).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tccs',
            payload: { title: 'Untrusted' },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('returns 503 without leaking connection details on database failure', async () => {
    const app = await createApp(readConfig({ NODE_ENV: 'test' }), {
      isReady: async () => {
        throw new Error('postgres://private:password@internal');
      },
    });
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        status: 'unavailable',
        database: 'unavailable',
      });
      expect(response.body).not.toMatch(/private|password|internal/);
    } finally {
      await app.close();
    }
  });
});

describe('configuration boundaries', () => {
  it('cannot fall back to embedded database in production', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://example/db',
      }),
    ).toThrow(/CORS_ORIGINS/);
    const config = readConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example/db',
      CORS_ORIGINS: 'https://vitorsfeijo.github.io',
    });
    expect(config.environment).toBe('production');
    expect(config.databaseUrl).toBe('postgresql://example/db');
  });

  it('rejects wildcard, paths, invalid ports and invalid database protocols', () => {
    for (const origin of ['*', 'https://example.com/path', 'file:///data']) {
      expect(() => readConfig({ CORS_ORIGINS: origin })).toThrow();
    }
    expect(() => readConfig({ PORT: '0' })).toThrow(/PORT/);
    expect(() => readConfig({ DATABASE_URL: 'file:db' })).toThrow(/PostgreSQL/);
  });
});
