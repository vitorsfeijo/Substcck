import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './database.js';

export async function migrate(
  db: Database,
  directory = resolve('db/migrations'),
) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error('Nenhuma migração encontrada.');
  for (const name of names) {
    const sql = (await readFile(resolve(directory, name), 'utf8')).replace(
      /\r\n/g,
      '\n',
    );
    const checksum = createHash('sha256').update(sql).digest('hex');
    await db.transaction(async (tx) => {
      await tx.exec('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const existing = await tx.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migração aplicada foi alterada: ${name}`);
        }
        return;
      }
      await tx.exec(sql);
      await tx.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, checksum],
      );
    });
  }
}
