import { randomUUID } from 'node:crypto';
import { readConfig } from '../config.js';
import { openDatabase } from '../data/database.js';
import { migrate } from '../data/migrate.js';

const config = readConfig();
if (config.environment === 'production') {
  throw new Error(
    'A prova de persistência é exclusiva para desenvolvimento/teste.',
  );
}
const key = `probe-${randomUUID()}`;
const value = randomUUID();
let db = await openDatabase(config);
try {
  await migrate(db);
  await db.query('INSERT INTO platform_metadata (key, value) VALUES ($1, $2)', [
    key,
    value,
  ]);
} finally {
  await db.close();
}
db = await openDatabase(config);
try {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM platform_metadata WHERE key = $1',
    [key],
  );
  if (result.rows[0]?.value !== value)
    throw new Error('Persistência não confirmada.');
  await db.query('DELETE FROM platform_metadata WHERE key = $1', [key]);
  console.log(
    'Persistência confirmada: gravação, fechamento, reabertura e leitura do banco.',
  );
} finally {
  await db.close();
}
