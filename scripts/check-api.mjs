import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const named = (value) =>
  object(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string';
const publicWorks = (value) =>
  Array.isArray(value) &&
  value.every(
    (work) =>
      object(work) &&
      typeof work.id === 'string' &&
      typeof work.title === 'string' &&
      work.status === 'PUBLICADO',
  );

async function readJson(response, maximumBytes = 1_048_576) {
  const reader = response.body?.getReader();
  assert(reader, 'API returned no response body.');
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(
        size <= maximumBytes,
        'API response exceeds the smoke-check limit.',
      );
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Public GETs only: never sign in, publish, record a view, or download a file. */
export async function checkApi(
  value,
  frontendValue,
  { timeoutMs = 30_000, requireProduction = true } = {},
) {
  assert(value, 'Provide API_URL or VITE_API_URL.');
  const api = new URL(value);
  const frontend = new URL(frontendValue);
  assert(
    [api, frontend].every(
      (url) =>
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
    ),
    'API and frontend URLs must be HTTP(S), without credentials, query or fragment.',
  );
  assert(
    frontend.protocol !== 'https:' || api.protocol === 'https:',
    'An HTTPS frontend requires an HTTPS API.',
  );
  const base = api.href.replace(/\/+$/, '');
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const checked = [];
  const get = async (endpoint) => {
    const response = await fetch(`${base}${endpoint}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Origin: frontend.origin },
      redirect: 'error',
      cache: 'no-store',
      signal,
    });
    assert(response.ok, `API ${endpoint} returned HTTP ${response.status}.`);
    assert(
      response.headers.get('access-control-allow-origin') === frontend.origin &&
        response.headers.get('access-control-allow-credentials') === 'true',
      `API ${endpoint} does not allow credentialed requests from the frontend origin.`,
    );
    assert(
      /\bapplication\/json\b/i.test(response.headers.get('content-type') || ''),
      `API ${endpoint} did not return JSON.`,
    );
    const data = await readJson(response);
    assert(object(data), `API ${endpoint} returned an invalid object.`);
    checked.push(endpoint);
    return data;
  };

  const health = await get('/health');
  assert(
    health.status === 'ok' &&
      health.database === 'ok' &&
      health.service === 'subtccstack-api' &&
      (!requireProduction || health.environment === 'production'),
    'API or production database is not ready.',
  );
  const auth = await get('/auth/config');
  assert(
    ['disabled', 'oidc'].includes(auth.mode) &&
      (auth.mode === 'disabled'
        ? auth.loginUrl === null
        : auth.loginUrl === `${base}/auth/login`) &&
      !('developmentUsers' in auth),
    'Public API exposes an invalid or development authentication configuration.',
  );
  const options = await get('/discovery-options');
  for (const key of ['authors', 'advisors', 'tags', 'areas', 'collections']) {
    assert(
      Array.isArray(options[key]) && options[key].every(named),
      `API discovery options contain invalid ${key}.`,
    );
  }
  assert(
    Array.isArray(options.years) &&
      options.years.every((year) => Number.isInteger(year)),
    'API discovery options contain invalid years.',
  );
  const feed = await get('/feed');
  assert(
    publicWorks(feed.recent) &&
      Array.isArray(feed.topics) &&
      feed.topics.every(
        (topic) =>
          named(topic) && Number.isFinite(topic.views) && topic.views >= 0,
      ) &&
      feed.windowDays === 30,
    'API feed is invalid or contains a non-public work.',
  );
  const page = await get('/tccs?page=1&pageSize=1');
  assert(
    publicWorks(page.items) &&
      page.items.length <= 1 &&
      page.page === 1 &&
      page.pageSize === 1 &&
      Number.isInteger(page.total) &&
      page.total >= page.items.length,
    'API search pagination is invalid or contains a non-public work.',
  );
  return {
    url: base,
    origin: frontend.origin,
    endpoints: checked.length,
    authentication: auth.mode,
    publishedWorks: page.total,
    elapsedMs: Date.now() - startedAt,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await checkApi(
    process.env.API_URL || process.env.VITE_API_URL,
    process.env.PAGE_URL || process.env.FRONTEND_URL,
  );
  console.log(JSON.stringify(result));
  if (result.authentication === 'disabled')
    console.warn(
      'Public reading verified; institutional sign-in remains disabled.',
    );
}
