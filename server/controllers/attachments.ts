import type { FastifyInstance, FastifyReply } from 'fastify';
import type {} from '@fastify/multipart';
import type { Database } from '../data/database.js';
import type { ServerConfig } from '../config.js';
import { requireCsrf, requireStudent } from '../auth/access.js';
import {
  AttachmentError,
  type AttachmentKind,
  type AttachmentStore,
} from '../models/attachments.js';
import { createAttachmentRepository } from '../attachments/repository.js';
import {
  deleteOwnedAttachment,
  uploadAttachment,
} from '../attachments/service.js';
import { DOCUMENT_LIMIT, IMAGE_LIMIT } from '../attachments/validation.js';

function failure(error: unknown, reply: FastifyReply) {
  if (error instanceof AttachmentError)
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message });
  if (error instanceof Error && 'code' in error) {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.code(413).send({
        code: 'ATTACHMENT_TOO_LARGE',
        message: 'O arquivo excede o tamanho permitido.',
      });
    if (
      [
        'FST_FILES_LIMIT',
        'FST_PARTS_LIMIT',
        'FST_FIELDS_LIMIT',
        'FST_INVALID_MULTIPART_CONTENT_TYPE',
      ].includes(String(error.code))
    )
      return reply.code(400).send({
        code: 'INVALID_ATTACHMENT',
        message: 'Envie somente um arquivo por requisição.',
      });
  }
  return reply.code(503).send({
    code: 'STORAGE_UNAVAILABLE',
    message: 'Não foi possível acessar o arquivo. Tente novamente.',
  });
}

export function attachmentController(
  app: FastifyInstance,
  db: Database,
  config: ServerConfig,
  store: AttachmentStore,
) {
  const repository = createAttachmentRepository(db);
  app.post<{ Querystring: { kind: AttachmentKind; description?: string } }>(
    '/api/attachments',
    {
      bodyLimit: DOCUMENT_LIMIT + 1024 * 1024,
      preHandler: [
        requireStudent,
        async (request, reply) => requireCsrf(request, reply, config),
      ],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['image', 'document'] },
            description: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        if (!request.isMultipart())
          throw new AttachmentError(
            'INVALID_ATTACHMENT',
            'Envie o arquivo como formulário multipart.',
            400,
          );
        let file: { data: Buffer; originalName: string } | undefined;
        const limit =
          request.query.kind === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT;
        for await (const part of request.parts({
          limits: { files: 1, fields: 0, parts: 1, fileSize: limit },
        })) {
          if (part.type !== 'file' || part.fieldname !== 'file' || file)
            throw new AttachmentError(
              'INVALID_ATTACHMENT',
              'Envie somente um arquivo no campo file.',
              400,
            );
          const data = await part.toBuffer();
          if (part.file.truncated)
            throw new AttachmentError(
              'ATTACHMENT_TOO_LARGE',
              'O arquivo excede o tamanho permitido.',
              413,
            );
          file = { data, originalName: part.filename };
        }
        if (!file)
          throw new AttachmentError(
            'INVALID_ATTACHMENT',
            'Selecione um arquivo.',
            400,
          );
        const attachment = await uploadAttachment(db, store, {
          ...file,
          kind: request.query.kind,
          description: request.query.description,
          authorId: request.identity!.user.id,
        });
        return reply.code(201).send(attachment);
      } catch (error) {
        return failure(error, reply);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/attachments/:id',
    async (request, reply) => {
      try {
        const authorId =
          request.identity?.user.role === 'student'
            ? request.identity.user.id
            : undefined;
        const record = await repository.findReadable(
          request.params.id,
          authorId,
        );
        if (!record)
          throw new AttachmentError(
            'ATTACHMENT_NOT_FOUND',
            'Anexo não encontrado.',
            404,
          );
        const stored = await store.get(record.storageKey);
        reply
          .type(record.mimeType)
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'private, no-store');
        if (record.kind === 'document') {
          const encoded = encodeURIComponent(record.originalName).replace(
            /['()*]/g,
            (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
          );
          reply.header(
            'Content-Disposition',
            `attachment; filename="document.${record.format!.toLowerCase()}"; filename*=UTF-8''${encoded}`,
          );
          reply.header('Content-Security-Policy', 'sandbox');
        }
        return reply.send(stored.body);
      } catch (error) {
        return failure(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/attachments/:id',
    {
      preHandler: [
        requireStudent,
        async (request, reply) => requireCsrf(request, reply, config),
      ],
    },
    async (request, reply) => {
      try {
        await deleteOwnedAttachment(
          db,
          store,
          request.params.id,
          request.identity!.user.id,
        );
        return reply.code(204).send();
      } catch (error) {
        return failure(error, reply);
      }
    },
  );
}
