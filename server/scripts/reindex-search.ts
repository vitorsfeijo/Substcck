import { readConfig } from '../config.js';
import { openDatabase } from '../data/database.js';
import { migrate } from '../data/migrate.js';
import { rebuildSemanticDocuments } from '../semantic/documents.js';

const db = await openDatabase(readConfig());
try {
  await migrate(db);
  const count = await rebuildSemanticDocuments(db);
  console.log(`Índice público reconstruído: ${count} trabalhos.`);
} finally {
  await db.close();
}
