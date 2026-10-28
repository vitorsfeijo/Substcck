import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { ServerConfig } from './config.js';
import { platformController } from './controllers/platform.js';
import type { PlatformRepository } from './repositories/platform.js';
import type { Database } from './data/database.js';
import type { IdentityAdapter } from './models/auth.js';
import { authController } from './controllers/auth.js';
import { tccController } from './controllers/tcc.js';
import { TccValidationError, TccAccessError } from './models/tcc.js';
import {
  LumePublicationError,
  PublicationConflictError,
} from './models/publication.js';
import type { AttachmentStore } from './models/attachments.js';
import type { LumeValidator } from './services/lume.js';
import { createLumeValidator } from './services/lume.js';
import { attachmentController } from './controllers/attachments.js';
import { requireCsrf, requireStudent } from './auth/access.js';

export async function createApp(
  config: ServerConfig,
  repository: PlatformRepository,
  dependencies: {
    database?: Database;
    identityAdapter?: IdentityAdapter;
    attachmentStore?: AttachmentStore;
    lumeValidator?: LumeValidator;
  } = {},
) {
  const app = Fastify({
    logger:
      config.environment === 'test'
        ? false
        : {
            serializers: {
              req(request) {
                return {
                  method: request.method,
                  url: request.url?.split('?')[0],
                  remoteAddress: request.ip,
                };
              },
            },
          },
    bodyLimit: 1024 * 1024,
  });
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  await authController(
    app,
    config,
    dependencies.database,
    dependencies.identityAdapter,
  );
  platformController(app, repository, config);
  if (dependencies.database) {
    tccController(
      app,
      dependencies.database,
      config,
      dependencies.lumeValidator || createLumeValidator(),
    );
    if (dependencies.attachmentStore)
      attachmentController(
        app,
        dependencies.database,
        config,
        dependencies.attachmentStore,
      );
    else
      app.post(
        '/api/attachments',
        {
          preHandler: [
            requireStudent,
            async (request, reply) => requireCsrf(request, reply, config),
          ],
        },
        async (_request, reply) =>
          reply.code(503).send({
            code: 'STORAGE_UNAVAILABLE',
            message: 'O armazenamento de anexos ainda não está configurado.',
          }),
      );
  }
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LumePublicationError)
      return reply.code(422).send({
        code: 'LUME_INVALID',
        message: error.message,
        canSaveDraft: error.canSaveDraft,
      });
    if (error instanceof PublicationConflictError)
      return reply
        .code(409)
        .send({ code: 'IDEMPOTENCY_CONFLICT', message: error.message });
    if (error instanceof TccValidationError)
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        fields: error.fields,
      });
    if (error instanceof TccAccessError)
      return reply
        .code(404)
        .send({ code: 'NOT_FOUND', message: 'Trabalho não encontrado.' });
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      error.validation
    )
      return reply
        .code(400)
        .send({ code: 'INVALID_REQUEST', message: 'Requisição inválida.' });
    request.log.error(
      { code: 'REQUEST_FAILED' },
      'Falha ao processar requisição.',
    );
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a requisição.',
    });
  });
  return app;
}
