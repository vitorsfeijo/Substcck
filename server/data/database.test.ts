import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { migrate } from './migrate.js';
import { createPlatformRepository } from '../repositories/platform.js';

it('applies once, persists across reopening, rejects changed migrations and rolls back failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtccstack-'));
  const migrations = join(root, 'migrations');
  await mkdir(migrations);
  const firstMigration = await readFile(
    resolve('server/db/migrations/001_platform.sql'),
    'utf8',
  );
  await writeFile(join(migrations, '001_platform.sql'), firstMigration);
  let db = await openDatabase({ dataDir: join(root, 'db') });
  try {
    await migrate(db, migrations);
    await migrate(db, migrations);
    await writeFile(
      join(migrations, '001_platform.sql'),
      firstMigration.replace(/\r?\n/g, '\r\n'),
    );
    await migrate(db, migrations);
    await writeFile(join(migrations, '001_platform.sql'), firstMigration);
    expect(await createPlatformRepository(db).isReady()).toBe(true);
    const ledger = await db.query('SELECT name FROM schema_migrations');
    expect(ledger.rows).toHaveLength(1);
    await db.query(
      'INSERT INTO platform_metadata (key, value) VALUES ($1, $2)',
      ['probe', "persisted ' value"],
    );
    await db.close();
    db = await openDatabase({ dataDir: join(root, 'db') });
    const persisted = await db.query(
      'SELECT value FROM platform_metadata WHERE key = $1',
      ['probe'],
    );
    expect(persisted.rows[0]?.value).toBe("persisted ' value");

    await writeFile(
      join(migrations, '001_platform.sql'),
      firstMigration + '\n-- altered',
    );
    await expect(migrate(db, migrations)).rejects.toThrow(/foi alterada/);
    await writeFile(join(migrations, '001_platform.sql'), firstMigration);
    await writeFile(
      join(migrations, '002_invalid.sql'),
      'CREATE TABLE rollback_probe (id INT); SELECT * FROM missing_table;',
    );
    await expect(migrate(db, migrations)).rejects.toThrow();
    const result = await db.query(
      "SELECT to_regclass('rollback_probe') AS table_name",
    );
    expect(result.rows[0]?.table_name).toBeNull();
    expect(
      (await db.query('SELECT name FROM schema_migrations')).rows,
    ).toHaveLength(1);
  } finally {
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
