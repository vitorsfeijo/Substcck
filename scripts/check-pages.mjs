import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function normalizeBase(value = '/Subtccstack/') {
  assert(
    value.startsWith('/') && value.endsWith('/'),
    'VITE_BASE_PATH must start and end with /.',
  );
  assert(
    !value.includes('..') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#'),
    'Invalid Pages base path.',
  );
  return value;
}

export function assetPaths(html) {
  return [
    ...html.matchAll(
      /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi,
    ),
  ]
    .map((match) => match[1])
    .filter((value) => /\.(?:js|css)(?:[?#].*)?$/.test(value));
}

export async function checkPages(
  directory = 'dist',
  basePath = process.env.VITE_BASE_PATH || '/Subtccstack/',
) {
  const base = normalizeBase(basePath);
  const root = path.resolve(directory);
  const files = [];
  async function inspect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      const relative = path.relative(root, fullPath).split(path.sep).join('/');
      assert(
        !(await lstat(fullPath)).isSymbolicLink(),
        `Symlink in artifact: ${relative}`,
      );
      if (entry.isDirectory()) {
        assert(
          entry.name === 'assets',
          `Unexpected output directory: ${relative}`,
        );
        await inspect(fullPath);
      } else {
        assert(entry.isFile(), `Unexpected artifact entry: ${relative}`);
        assert(
          !entry.name.startsWith('.'),
          `Hidden file in artifact: ${relative}`,
        );
        assert(
          !/\.(?:map|sql|ya?ml|md|ts|tsx|json|env)$/i.test(entry.name),
          `Private/source file in artifact: ${relative}`,
        );
        assert(
          relative === 'index.html' ||
            relative === 'favicon.svg' ||
            /^assets\/[\w./-]+\.(?:js|css|svg|png|jpe?g|webp|avif|woff2?)$/i.test(
              relative,
            ),
          `Unexpected output file: ${relative}`,
        );
        files.push(relative);
      }
    }
  }
  await inspect(root);
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert(
    /<html\b[^>]*lang=["']pt-BR["']/i.test(html),
    'Missing Portuguese document language.',
  );
  assert(/<div\b[^>]*id=["']root["']/i.test(html), 'Missing application root.');
  const assets = assetPaths(html);
  assert(
    assets.some((asset) => /\.js(?:[?#].*)?$/.test(asset)),
    'No JavaScript entrypoint found.',
  );
  assert(
    assets.some((asset) => /\.css(?:[?#].*)?$/.test(asset)),
    'No CSS asset found.',
  );
  for (const asset of assets) {
    assert(
      asset.startsWith(`${base}assets/`),
      `Asset does not use Pages prefix ${base}: ${asset}`,
    );
    const relative = asset.slice(base.length).split(/[?#]/)[0];
    assert(
      !relative.includes('..') && !relative.includes('\\'),
      `Unsafe asset path: ${asset}`,
    );
    assert(files.includes(relative), `Referenced asset is absent: ${asset}`);
  }
  return { base, files: files.length, assets };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await checkPages();
  console.log(
    `Pages artifact checked: ${result.files} files; base ${result.base}.`,
  );
}
