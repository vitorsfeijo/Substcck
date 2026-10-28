import { randomUUID } from 'node:crypto';
import type { Database } from '../data/database.js';
import {
  AttachmentError,
  type AttachmentKind,
  type AttachmentRecord,
  type AttachmentStore,
} from '../models/attachments.js';
import { createAttachmentRepository, getAttachmentDTO } from './repository.js';
import { validateAttachmentContent } from './validation.js';

export async function uploadAttachment(
  db: Database,
  store: AttachmentStore,
  input: {
    authorId: string;
    kind: AttachmentKind;
    originalName: string;
    description?: string;
    data: Buffer;
  },
) {
  const originalName = Array.from(input.originalName.split(/[\\/]/).pop() || '')
    .filter(
      (character) =>
        character.codePointAt(0)! >= 32 && character.codePointAt(0)! !== 127,
    )
    .join('')
    .slice(0, 255)
    .replace(/[\uD800-\uDBFF]$/, '')
    .trim();
  const description = input.description || '';
  if (
    !originalName ||
    originalName === '.' ||
    originalName === '..' ||
    description.length > 300
  )
    throw new AttachmentError(
      'INVALID_ATTACHMENT',
      'Informe um nome e uma descrição de até 300 caracteres.',
      400,
    );
  const author = await db.query(
    'SELECT id FROM users WHERE id = $1 AND role = $2',
    [input.authorId, 'student'],
  );
  if (!author.rows[0])
    throw new AttachmentError(
      'ATTACHMENT_NOT_FOUND',
      'Anexo não encontrado.',
      404,
    );
  const verified = await validateAttachmentContent(input.kind, input.data);
  const id = randomUUID();
  const record: AttachmentRecord = {
    id,
    kind: input.kind,
    originalName,
    description,
    authorId: input.authorId,
    storageKey: `attachments/${id}`,
    mimeType: verified.mimeType,
    format: verified.format,
    size: input.data.length,
    createdAt: new Date().toISOString(),
    url: `/api/attachments/${id}`,
  };
  try {
    await store.put(record.storageKey, input.data, record.mimeType);
  } catch {
    throw new AttachmentError(
      'STORAGE_UNAVAILABLE',
      'Não foi possível armazenar o arquivo. Tente novamente.',
      503,
    );
  }
  try {
    await createAttachmentRepository(db).insert(record);
  } catch {
    // A failed metadata write must not leave a usable reference to partial data.
    await store.remove(record.storageKey).catch(() => undefined);
    throw new AttachmentError(
      'STORAGE_UNAVAILABLE',
      'Não foi possível registrar o arquivo. Tente novamente.',
      503,
    );
  }
  return getAttachmentDTO(record);
}

export async function deleteOwnedAttachment(
  db: Database,
  store: AttachmentStore,
  id: string,
  authorId: string,
) {
  return db.transaction(async (tx) => {
    const repository = createAttachmentRepository(tx);
    const record = await repository.findOwned(id, authorId, true);
    if (!record)
      throw new AttachmentError(
        'ATTACHMENT_NOT_FOUND',
        'Anexo não encontrado.',
        404,
      );
    if (await repository.referencedByTcc(id))
      throw new AttachmentError(
        'ATTACHMENT_IN_USE',
        'O anexo pertence a um trabalho e não pode ser removido diretamente.',
        409,
      );
    try {
      await store.remove(record.storageKey);
    } catch {
      throw new AttachmentError(
        'STORAGE_UNAVAILABLE',
        'Não foi possível remover o arquivo. Tente novamente.',
        503,
      );
    }
    await repository.remove(id);
  });
}

/** Only unreferenced staged metadata older than 24h is eligible by default. */
export async function pruneOrphanAttachments(
  db: Database,
  store: AttachmentStore,
  before = new Date(Date.now() - 24 * 60 * 60 * 1000),
) {
  if (
    !Number.isFinite(before.getTime()) ||
    before > new Date(Date.now() - 60 * 60 * 1000)
  )
    throw new Error('A limpeza exige margem mínima de uma hora.');
  const candidates = await createAttachmentRepository(db).listOrphans(before);
  let deleted = 0;
  for (const candidate of candidates) {
    await db.transaction(async (tx) => {
      const repository = createAttachmentRepository(tx);
      const record = await repository.findById(candidate.id, true);
      if (
        !record ||
        new Date(record.createdAt) >= before ||
        (await repository.referencedByTcc(record.id))
      )
        return;
      await store.remove(record.storageKey);
      await repository.remove(record.id);
      deleted++;
    });
  }
  return deleted;
}
