import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Dynamic URLs let these TypeScript tests exercise the deploy scripts unchanged.
const { checkApi } = await import(
  new URL('../scripts/check-api.mjs', import.meta.url).href
);
const { checkLive } = await import(
  new URL('../scripts/check-live.mjs', import.meta.url).href
);

describe('read-only deployment checks against real HTTP responses', () => {
  let server: Server;
  let origin: string;
  let fault: string;
  let apiMetadata: string;
  const requests: {
    method: string;
    url: string;
    origin: string | undefined;
  }[] = [];

  beforeEach(async () => {
    fault = '';
    apiMetadata = '';
    requests.length = 0;
    server = createServer((request, response) => {
      const url = request.url || '';
      requests.push({
        method: request.method || '',
        url,
        origin: request.headers.origin,
      });
      if (url.startsWith('/Substcck/')) {
        if (url.endsWith('.js')) {
          response.setHeader('Content-Type', 'application/javascript');
          response.end('console.log("fixture");');
        } else if (url.endsWith('.css')) {
          response.setHeader('Content-Type', 'text/css');
          response.end('body { margin: 0; }');
        } else {
          response.setHeader('Content-Type', 'text/html');
          response.end(
            `<html><head><meta name="substcck-api-url" content="${apiMetadata}"><script src="/Substcck/app.js"></script><link href="/Substcck/app.css"></head><body><div id="root"></div></body></html>`,
          );
        }
        return;
      }
      response.setHeader(
        'Access-Control-Allow-Origin',
        fault === 'cors-wildcard' ? '*' : request.headers.origin || origin,
      );
      if (fault !== 'cors-credentials')
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (fault === 'redirect') {
        response.writeHead(302, { Location: '/redirect-target' });
        response.end();
        return;
      }
      if (fault === 'timeout') {
        response.writeHead(200);
        response.write('{');
        return;
      }
      if (fault === 'oversize') {
        response.end(JSON.stringify({ huge: 'x'.repeat(1_048_576) }));
        return;
      }
      if (fault === 'html') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<html>proxy fallback</html>');
        return;
      }
      if (fault === 'database') {
        response.writeHead(503);
        response.end(JSON.stringify({ status: 'unavailable' }));
        return;
      }
      const work = { id: 'public-1', title: 'Research', status: 'PUBLICADO' };
      if (fault === 'draft') work.status = 'RASCUNHO';
      const data: Record<string, unknown> = {
        '/api/health': {
          status: 'ok',
          database: 'ok',
          environment: fault === 'development' ? 'development' : 'production',
          service: 'subtccstack-api',
        },
        '/api/auth/config': {
          mode: fault === 'fake-login' ? 'development' : 'disabled',
          loginUrl: null,
        },
        '/api/discovery-options': {
          authors: [],
          advisors: [],
          years: [],
          tags: [],
          areas: [],
          collections: [],
        },
        '/api/feed': {
          recent: fault === 'draft' ? [work] : [],
          topics: [],
          windowDays: 30,
        },
        '/api/tccs?page=1&pageSize=1': {
          items: [],
          total: 0,
          page: 1,
          pageSize: fault === 'pagination' ? 12 : 1,
        },
      };
      if (fault === 'missing-route' && url === '/api/discovery-options') {
        response.writeHead(404);
        response.end(JSON.stringify({ code: 'NOT_FOUND' }));
        return;
      }
      response.end(JSON.stringify(data[url] || {}));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('verifies a real reachable API with an empty corpus using only public GETs', async () => {
    const result = await checkApi(`${origin}/api/`, `${origin}/Substcck/`);
    expect(result).toMatchObject({
      url: `${origin}/api`,
      origin,
      endpoints: 5,
      publishedWorks: 0,
      authentication: 'disabled',
    });
    expect(requests).toHaveLength(5);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(requests.every((request) => request.origin === origin)).toBe(true);
    expect(
      requests.some((request) => /views|login|attachments/.test(request.url)),
    ).toBe(false);
  });

  it.each(['cors-wildcard', 'cors-credentials'])(
    'rejects browser-incompatible credentialed CORS (%s)',
    async (value) => {
      fault = value;
      await expect(checkApi(`${origin}/api`, origin)).rejects.toThrow(
        /credentialed requests/,
      );
    },
  );

  it.each([
    ['database', /HTTP 503/],
    ['html', /did not return JSON/],
    ['missing-route', /HTTP 404/],
    ['development', /production database/],
    ['fake-login', /development authentication/],
    ['draft', /non-public work/],
    ['pagination', /pagination/],
    ['oversize', /exceeds the smoke-check limit/],
  ])('rejects a misleading healthy deployment: %s', async (value, message) => {
    fault = value as string;
    await expect(checkApi(`${origin}/api`, origin)).rejects.toThrow(
      message as RegExp,
    );
  });

  it('rejects redirects instead of checking another API location', async () => {
    fault = 'redirect';
    await expect(checkApi(`${origin}/api`, origin)).rejects.toThrow();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/health');
  });

  it('bounds a response whose body never finishes', async () => {
    fault = 'timeout';
    const started = Date.now();
    await expect(
      checkApi(`${origin}/api`, origin, { timeoutMs: 100 }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('refuses mixed-content and credential-bearing URLs before making requests', async () => {
    await expect(
      checkApi(`${origin}/api`, 'https://example.org/Substcck/'),
    ).rejects.toThrow(/HTTPS API/);
    await expect(
      checkApi('https://secret:password@example.org/api', origin),
    ).rejects.toThrow(/without credentials/);
    expect(requests).toHaveLength(0);
  });

  it('verifies frontend assets and explicitly reports an unconfigured API', async () => {
    const result = await checkLive(`${origin}/Substcck/`, { apiUrl: '' });
    expect(result).toMatchObject({
      assets: 2,
      api: { status: 'unconfigured' },
    });
    expect(requests.some((request) => request.url.startsWith('/api'))).toBe(
      false,
    );
  });

  it('checks the exact configured API together with the published frontend', async () => {
    apiMetadata = `${origin}/api`;
    const result = await checkLive(`${origin}/Substcck/`, {
      apiUrl: `${origin}/api/`,
    });
    expect(result.api).toMatchObject({ endpoints: 5, publishedWorks: 0 });
  });

  it('fails when the published frontend points to a different API', async () => {
    apiMetadata = 'https://wrong.example/api';
    await expect(
      checkLive(`${origin}/Substcck/`, { apiUrl: '', timeoutMs: 100 }),
    ).rejects.toThrow(/different API/);
    expect(requests.some((request) => request.url.startsWith('/api'))).toBe(
      false,
    );
  });
});
