import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createApp } from '../../server/app.js';
import { readConfig } from '../../server/config.js';
import { openDatabase } from '../../server/data/database.js';
import { migrate } from '../../server/data/migrate.js';
import { seedDevelopmentData } from '../../server/scripts/seed.js';
import { createPlatformRepository } from '../../server/repositories/platform.js';
import { createLumeValidator } from '../../server/services/lume.js';
import { LocalAttachmentStore } from '../../server/attachments/storage.js';

// This harness is never imported by the production entrypoint or Docker image.
const directory = resolve(process.env.SUBTCCSTACK_TEST_DIRECTORY || '.');
const allowedRoot = resolve('.cache/qa') + sep;
if (
  process.env.M5_LOCAL_ONLY !== '1' ||
  process.env.NODE_ENV !== 'test' ||
  !directory.startsWith(allowedRoot) ||
  !directory.slice(allowedRoot.length).startsWith('integration-')
) {
  throw new Error(
    'A regressão integrada exige seu diretório isolado e ambiente local de teste.',
  );
}
await mkdir(directory, { recursive: true });
const dataDir = resolve(directory, 'database');
let db = await openDatabase({ dataDir });
await migrate(db);
await seedDevelopmentData(db, { environment: 'test' });
await db.close();
// Prove that migrations and fixtures survive a real database close/reopen.
db = await openDatabase({ dataDir });
const persisted = await db.query<{ count: number }>(
  'SELECT count(*)::int AS count FROM tccs',
);
if (persisted.rows[0]?.count !== 5)
  throw new Error('A base não persistiu após reabertura.');
const config = readConfig({
  NODE_ENV: 'test',
  AUTH_MODE: 'development',
  HOST: '127.0.0.1',
  PORT: '3002',
  FRONTEND_URL: 'http://127.0.0.1:4174/Substcck/',
  PUBLIC_API_URL: 'http://127.0.0.1:3002/api',
  CORS_ORIGINS: 'http://127.0.0.1:4174',
  STORAGE_DRIVER: 'local',
});
const app = await createApp(config, createPlatformRepository(db), {
  database: db,
  attachmentStore: new LocalAttachmentStore(resolve(directory, 'uploads')),
  // Only the external HTTP response is controlled: URL policy and validation remain real.
  lumeValidator: createLumeValidator({
    fetch: async (input) =>
      new Response(null, {
        status: new URL(String(input)).pathname.includes('unavailable')
          ? 503
          : 200,
      }),
  }),
});
// Reset only this freshly allocated test database. Single-worker tests own its loopback server.
app.post('/__test/reset', async () => {
  await db.exec(
    'DELETE FROM tccs; DELETE FROM attachments; DELETE FROM tcc_write_requests;',
  );
  return seedDevelopmentData(db, { environment: 'test' });
});
app.addHook('onClose', () => db.close());
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void app.close());
await app.listen({ host: '127.0.0.1', port: 3002 });
