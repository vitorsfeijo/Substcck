import { readConfig } from '../config.js';
import { openDatabase } from '../data/database.js';
import { migrate } from '../data/migrate.js';

const db = await openDatabase(readConfig());
try {
  await migrate(db);
  console.log('Migrações aplicadas com sucesso.');
} finally {
  await db.close();
}
