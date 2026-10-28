import type { FastifyInstance } from 'fastify';
import type { Database } from '../data/database.js';
import type { TccFilter } from '../models/tcc.js';
import type { ServerConfig } from '../config.js';
import type { LumeValidator } from '../services/lume.js';
import { TccValidationError } from '../models/tcc.js';
import { createTccRepository } from '../repositories/tcc.js';
import { requireStudent, requireCsrf } from '../auth/access.js';
import { createPublicationService } from '../services/publication.js';

function parseFilter(query: Record<string, unknown>): TccFilter {
  const filter: Record<string, unknown> = {};
  const supported = new Set([
    'term',
    'year',
    'semester',
    'authorId',
    'advisorId',
    'tagIds',
    'areaIds',
    'collectionId',
    'dateFrom',
    'dateTo',
    'page',
    'pageSize',
  ]);
  for (const [key, value] of Object.entries(query)) {
    if (!supported.has(key) || typeof value !== 'string')
      throw new TccValidationError({ filter: 'Filtro inválido.' });
    if (['year', 'semester', 'page', 'pageSize'].includes(key))
      filter[key] = Number(value);
    else if (['tagIds', 'areaIds'].includes(key))
      filter[key] = value.split(',').filter(Boolean);
    else filter[key] = value;
  }
  return filter as TccFilter;
}

export function tccController(
  app: FastifyInstance,
  db: Database,
  config: ServerConfig,
  validator: LumeValidator,
) {
  const repository = createTccRepository(db);
  const publication = createPublicationService(db, validator);
  const writeGuards = [
    requireStudent,
    async (
      request: Parameters<typeof requireStudent>[0],
      reply: Parameters<typeof requireStudent>[1],
    ) => requireCsrf(request, reply, config),
  ];
  const notFound = { code: 'NOT_FOUND', message: 'Trabalho não encontrado.' };
  app.get('/api/tcc-options', async () => ({
    professors: (
      await db.query<{ id: string; name: string }>(
        "SELECT id, name FROM users WHERE role = 'professor' ORDER BY name, id",
      )
    ).rows,
    tags: await repository.listTags(),
    areas: await repository.listAreas(),
    collections: await repository.listCollections(),
  }));
  app.post<{ Body: { name: string; areaId?: string } }>(
    '/api/tags',
    {
      preHandler: writeGuards,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 50 },
            areaId: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      if (
        request.body.areaId &&
        !(await repository.listAreas()).some(
          (area) => area.id === request.body.areaId,
        )
      )
        throw new TccValidationError({
          areaId: 'Selecione uma área existente.',
        });
      return reply
        .code(201)
        .send(
          await repository.ensureTag(request.body.name, request.body.areaId),
        );
    },
  );
  app.post('/api/tccs', { preHandler: writeGuards }, async (request, reply) => {
    const key = request.headers['idempotency-key'];
    if (key !== undefined && typeof key !== 'string')
      throw new TccValidationError({ request: 'Chave de criação inválida.' });
    const response = await publication.submit(
      request.body,
      request.identity!.user,
      undefined,
      key,
    );
    return reply.code(201).send(response);
  });
  app.put<{ Params: { id: string } }>(
    '/api/tccs/:id',
    { preHandler: writeGuards },
    async (request) =>
      publication.submit(
        request.body,
        request.identity!.user,
        request.params.id,
      ),
  );
  app.get<{ Querystring: Record<string, unknown> }>(
    '/api/tccs',
    async (request) => repository.listPublic(parseFilter(request.query)),
  );
  app.get<{ Params: { id: string } }>(
    '/api/tccs/:id',
    async (request, reply) => {
      const tcc = await repository.findPublicById(request.params.id);
      if (!tcc) return reply.code(404).send(notFound);
      return tcc;
    },
  );
  app.get<{ Querystring: Record<string, unknown> }>(
    '/api/me/tccs',
    { preHandler: requireStudent },
    async (request) =>
      repository.listOwned(
        request.identity!.user.id,
        parseFilter(request.query),
      ),
  );
  app.get<{ Params: { id: string } }>(
    '/api/me/tccs/:id',
    { preHandler: requireStudent },
    async (request, reply) => {
      const tcc = await repository.findOwnedById(
        request.params.id,
        request.identity!.user.id,
      );
      if (!tcc) return reply.code(404).send(notFound);
      return tcc;
    },
  );
}
