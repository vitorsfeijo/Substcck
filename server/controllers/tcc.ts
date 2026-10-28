import type { FastifyInstance } from 'fastify';
import type { Database } from '../data/database.js';
import type { TccFilter } from '../models/tcc.js';
import { TccValidationError } from '../models/tcc.js';
import { createTccRepository } from '../repositories/tcc.js';
import { requireStudent } from '../auth/access.js';

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

export function tccController(app: FastifyInstance, db: Database) {
  const repository = createTccRepository(db);
  const notFound = { code: 'NOT_FOUND', message: 'Trabalho não encontrado.' };
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
