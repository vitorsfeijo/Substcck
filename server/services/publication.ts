import { createHash } from 'node:crypto';
import type { Database, SqlConnection } from '../data/database.js';
import type { User } from '../models/auth.js';
import type { MediaDTO, TccWriteInput } from '../models/tcc.js';
import { TccAccessError, TccValidationError } from '../models/tcc.js';
import type {
  PublicationResult,
  TccSubmission,
} from '../models/publication.js';
import {
  LumePublicationError,
  PublicationConflictError,
} from '../models/publication.js';
import { createTccRepository } from '../repositories/tcc.js';
import { validateTccInput } from './tcc-validation.js';
import type { LumeValidator } from './lume.js';

function parseSubmission(body: unknown, id?: string) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new TccValidationError({ input: 'Informe os dados do trabalho.' });
  const input = body as TccSubmission;
  const allowed = new Set([
    'intent',
    'title',
    'summary',
    'year',
    'semester',
    'defendedAt',
    'advisorId',
    'coadvisorId',
    'lumeUrl',
    'tagIds',
    'collectionId',
    'mediaIds',
    'fileId',
    'mediaDescriptions',
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw new TccValidationError({
      input: 'A requisição contém campos não permitidos.',
    });
  if (!['publish', 'draft'].includes(input.intent))
    throw new TccValidationError({
      intent: 'Escolha publicar ou salvar rascunho.',
    });
  const mediaIds = input.mediaIds ?? [];
  if (
    !Array.isArray(mediaIds) ||
    mediaIds.length > 3 ||
    mediaIds.some(
      (value) => typeof value !== 'string' || !value || value.length > 128,
    ) ||
    new Set(mediaIds).size !== mediaIds.length
  )
    throw new TccValidationError({
      mediaIds: 'Anexe até 3 imagens distintas.',
    });
  if (
    input.fileId !== undefined &&
    input.fileId !== null &&
    (typeof input.fileId !== 'string' ||
      !input.fileId ||
      input.fileId.length > 128)
  )
    throw new TccValidationError({ fileId: 'Arquivo inválido.' });
  const descriptions = input.mediaDescriptions ?? {};
  if (
    !descriptions ||
    typeof descriptions !== 'object' ||
    Array.isArray(descriptions) ||
    Object.entries(descriptions).some(
      ([key, value]) =>
        !mediaIds.includes(key) ||
        typeof value !== 'string' ||
        value.length > 300,
    )
  )
    throw new TccValidationError({
      mediaIds: 'A descrição das imagens deve ter até 300 caracteres.',
    });
  let data: TccWriteInput;
  try {
    data = validateTccInput({
      id,
      title: input.title,
      summary: input.summary,
      year: input.year,
      semester: input.semester,
      defendedAt: input.defendedAt,
      advisorId: input.advisorId,
      coadvisorId: input.coadvisorId,
      lumeUrl: input.lumeUrl,
      tagIds: input.tagIds,
      collectionId: input.collectionId,
      status: input.intent === 'publish' ? 'PUBLICADO' : 'RASCUNHO',
    });
  } catch (error) {
    const missingText = (value: unknown) =>
      typeof value !== 'string' || !value.trim();
    if (
      error instanceof TccValidationError &&
      input.intent === 'publish' &&
      (missingText(input.title) ||
        missingText(input.summary) ||
        !input.year ||
        !input.semester ||
        !input.defendedAt ||
        !input.advisorId ||
        missingText(input.lumeUrl) ||
        !input.tagIds?.length)
    )
      error.message = 'Preencha todos os campos obrigatórios';
    throw error;
  }
  const snapshot = {
    data,
    mediaIds,
    fileId: input.fileId || null,
    descriptions: Object.fromEntries(
      mediaIds.map((key) => [
        key,
        Object.hasOwn(descriptions, key) ? descriptions[key] : null,
      ]),
    ),
  };
  const hash = createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
  return { data, mediaIds, fileId: input.fileId || null, descriptions, hash };
}

interface AttachmentRow extends Record<string, unknown> {
  id: string;
  kind: 'image' | 'document';
  original_name: string;
  description: string;
  format: 'PDF' | 'DOCX' | 'EPUB' | null;
}

async function resolveAttachments(
  tx: SqlConnection,
  parsed: ReturnType<typeof parseSubmission>,
  authorId: string,
  tccId?: string,
) {
  const ids = [...parsed.mediaIds, ...(parsed.fileId ? [parsed.fileId] : [])];
  if (new Set(ids).size !== ids.length)
    throw new TccValidationError({
      fileId: 'Um documento não pode ser reutilizado como imagem.',
    });
  if (!ids.length) return { media: [], file: null };
  const result = await tx.query<AttachmentRow>(
    'SELECT id, kind, original_name, description, format FROM attachments WHERE author_id = $1 AND id = ANY($2::text[]) ORDER BY id FOR UPDATE',
    [authorId, ids],
  );
  if (result.rows.length !== ids.length)
    throw new TccValidationError({
      mediaIds: 'Um dos anexos não existe ou não pertence à sua conta.',
    });
  const references = await tx.query<{ tcc_id: string }>(
    'SELECT tcc_id FROM tcc_media WHERE id = ANY($1::text[]) UNION ALL SELECT tcc_id FROM tcc_files WHERE id = ANY($1::text[])',
    [ids],
  );
  if (references.rows.some((row) => row.tcc_id !== tccId))
    throw new TccValidationError({
      mediaIds: 'Um dos anexos já está vinculado a outro trabalho.',
    });
  const media: MediaDTO[] = parsed.mediaIds.map((id) => {
    const row = result.rows.find((record) => record.id === id)!;
    if (row.kind !== 'image')
      throw new TccValidationError({
        mediaIds: 'Selecione somente imagens para as demonstrações.',
      });
    return {
      id,
      url: `/api/attachments/${id}`,
      description: Object.hasOwn(parsed.descriptions, id)
        ? parsed.descriptions[id]!
        : row.description,
    };
  });
  const document = parsed.fileId
    ? result.rows.find((record) => record.id === parsed.fileId)!
    : null;
  if (document && (document.kind !== 'document' || !document.format))
    throw new TccValidationError({
      fileId: 'Selecione um documento PDF, DOCX ou EPUB.',
    });
  return {
    media,
    file: document
      ? {
          id: document.id,
          originalName: document.original_name,
          format: document.format!,
          path: `/api/attachments/${document.id}`,
        }
      : null,
  };
}

export function createPublicationService(
  db: Database,
  validator: LumeValidator,
) {
  const repository = createTccRepository(db);
  return {
    async submit(
      body: unknown,
      author: User,
      id?: string,
      idempotencyKey?: string,
    ): Promise<PublicationResult> {
      if (author.role !== 'student') throw new TccAccessError();
      const previous = id
        ? await repository.findOwnedById(id, author.id)
        : null;
      if (id && !previous) throw new TccAccessError();
      const parsed = parseSubmission(body, id);
      if (
        previous?.status === 'PUBLICADO' &&
        parsed.data.status !== 'PUBLICADO'
      )
        throw new TccValidationError({
          intent: 'Um trabalho publicado não pode ser convertido em rascunho.',
        });
      if (
        idempotencyKey !== undefined &&
        (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey) || id)
      )
        throw new TccValidationError({ request: 'Chave de criação inválida.' });
      if (idempotencyKey) {
        const cached = await db.query<{
          payload_hash: string;
          response: PublicationResult | null;
        }>(
          'SELECT payload_hash, response FROM tcc_write_requests WHERE author_id = $1 AND request_key = $2',
          [author.id, idempotencyKey],
        );
        if (cached.rows[0]) {
          if (cached.rows[0].payload_hash !== parsed.hash)
            throw new PublicationConflictError();
          if (cached.rows[0].response) return cached.rows[0].response;
        }
      }
      if (parsed.data.status === 'PUBLICADO') {
        const validation = await validator.validate(parsed.data.lumeUrl!);
        if (!validation.valid)
          throw new LumePublicationError(previous?.status !== 'PUBLICADO');
        parsed.data.lumeUrl = validation.url;
      }
      // External LUME requests finish before row locks. Only durable writes are transactional.
      return db.transaction(async (tx) => {
        if (idempotencyKey) {
          await tx.query(
            'INSERT INTO tcc_write_requests (author_id, request_key, payload_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [author.id, idempotencyKey, parsed.hash],
          );
          const request = (
            await tx.query<{
              payload_hash: string;
              response: PublicationResult | null;
            }>(
              'SELECT payload_hash, response FROM tcc_write_requests WHERE author_id = $1 AND request_key = $2 FOR UPDATE',
              [author.id, idempotencyKey],
            )
          ).rows[0]!;
          if (request.payload_hash !== parsed.hash)
            throw new PublicationConflictError();
          if (request.response) return request.response;
        }
        const attachments = await resolveAttachments(tx, parsed, author.id, id);
        const transactionDb: Database = {
          ...tx,
          query: (sql, params) => tx.query(sql, params),
          exec: (sql) => tx.exec(sql),
          transaction: (work) => work(tx),
          close: async () => {},
        };
        const tcc = await createTccRepository(transactionDb).save(
          { ...parsed.data, ...attachments },
          author.id,
        );
        const response = {
          tcc,
          message:
            parsed.data.status === 'RASCUNHO'
              ? 'Rascunho salvo com sucesso'
              : previous?.status === 'PUBLICADO'
                ? 'TCC atualizado com sucesso!'
                : 'TCC publicado com sucesso!',
        };
        if (idempotencyKey)
          await tx.query(
            'UPDATE tcc_write_requests SET response = $3::jsonb WHERE author_id = $1 AND request_key = $2',
            [author.id, idempotencyKey, JSON.stringify(response)],
          );
        return response;
      });
    },
  };
}
