import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPaths } from './check-pages.mjs';
import { checkApi } from './check-api.mjs';

export async function checkLive(
  value,
  { timeoutMs = 55_000, apiUrl = process.env.VITE_API_URL || '' } = {},
) {
  assert(value, 'Provide PAGE_URL or pass a site URL as the first argument.');
  const site = new URL(value);
  assert(
    ['https:', 'http:'].includes(site.protocol),
    'Expected an HTTP(S) URL.',
  );
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const get = async (url) => {
        const remaining = deadline - Date.now();
        assert(remaining > 0, 'Published site check timed out.');
        const response = await fetch(url, {
          signal: AbortSignal.timeout(Math.min(8_000, remaining)),
          cache: 'no-store',
        });
        assert(response.ok, `HTTP ${response.status} at ${url}`);
        return response;
      };
      const response = await get(site);
      assert(
        response.headers.get('content-type')?.includes('text/html'),
        'Site did not return HTML.',
      );
      const html = await response.text();
      assert(
        /<div\b[^>]*id=["']root["']/i.test(html),
        'Application root is absent.',
      );
      const configuredApi = apiUrl.replace(/\/+$/, '');
      const metadata = html.match(
        /<meta\b[^>]*name=["']substcck-api-url["'][^>]*content=["']([^"']*)["']/i,
      );
      assert(metadata, 'Published frontend API metadata is absent.');
      const actualApi = metadata[1]
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      assert(
        actualApi === configuredApi,
        'Published frontend points to a different API configuration.',
      );
      const assets = assetPaths(html);
      assert(
        assets.some((asset) => /\.js(?:[?#].*)?$/.test(asset)),
        'JavaScript entrypoint is absent.',
      );
      assert(
        assets.some((asset) => /\.css(?:[?#].*)?$/.test(asset)),
        'CSS asset is absent.',
      );
      for (const asset of assets) {
        const url = new URL(asset, site);
        assert(
          url.origin === site.origin && url.pathname.startsWith(site.pathname),
          `Unexpected published asset origin/path: ${url}`,
        );
        const result = await get(url);
        const type = result.headers.get('content-type') || '';
        assert(
          !type.includes('text/html'),
          `Asset returned an HTML fallback: ${url}`,
        );
        if (/\.css$/.test(url.pathname))
          assert(
            type.includes('text/css'),
            `Invalid CSS content type: ${type}`,
          );
        if (/\.js$/.test(url.pathname))
          assert(
            /javascript/.test(type),
            `Invalid JavaScript content type: ${type}`,
          );
        assert(
          (await result.arrayBuffer()).byteLength > 0,
          `Empty asset: ${url}`,
        );
      }
      const remaining = deadline - Date.now();
      assert(remaining > 0, 'Published site check timed out.');
      const api = configuredApi
        ? await checkApi(configuredApi, site.href, {
            timeoutMs: Math.min(30_000, remaining),
          })
        : { status: 'unconfigured' };
      return { url: site.href, assets: assets.length, api };
    } catch (error) {
      lastError = error;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(3_000, remaining)),
      );
    }
  }
  throw new Error(
    `Published site verification failed: ${lastError?.message || 'timeout'}`,
    { cause: lastError },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await checkLive(process.env.PAGE_URL || process.argv[2]);
  console.log(
    `Published site verified: ${result.url} (${result.assets} assets).`,
  );
  if (result.api.status === 'unconfigured')
    console.warn('Frontend verified; production API is not configured.');
  else {
    console.log(`Public API verified: ${result.api.endpoints} endpoints.`);
    if (result.api.authentication === 'disabled')
      console.warn('Institutional sign-in remains disabled.');
  }
}
