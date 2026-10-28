import { readConfig } from './config.js';
import { openDatabase } from './data/database.js';
import { createApp } from './app.js';
import { createPlatformRepository } from './repositories/platform.js';
import { createOidcAdapter } from './auth/oidc.js';

const config = readConfig();
const db = await openDatabase(config);
const identityAdapter = config.auth.oidc
  ? await createOidcAdapter(config.auth.oidc)
  : undefined;
const app = await createApp(config, createPlatformRepository(db), {
  database: db,
  identityAdapter,
});
app.addHook('onClose', () => db.close());
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void app.close();
  });
}
try {
  await app.listen({ host: config.host, port: config.port });
} catch {
  app.log.error(
    'Não foi possível iniciar a API. Confira a configuração do servidor.',
  );
  await app.close();
  process.exitCode = 1;
}
