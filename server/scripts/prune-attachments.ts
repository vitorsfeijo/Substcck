import { readConfig } from '../config.js';
import { openDatabase } from '../data/database.js';
import { createAttachmentStore } from '../attachment-store.js';
import { pruneOrphanAttachments } from '../attachments/service.js';

const config = readConfig();
const store = createAttachmentStore(config);
if (!store)
  throw new Error('Configure o armazenamento antes de remover uploads órfãos.');
const db = await openDatabase(config);
try {
  const count = await pruneOrphanAttachments(db, store);
  console.log(
    `${count} uploads sem referências e com mais de 24 horas removidos.`,
  );
} finally {
  await db.close();
}
