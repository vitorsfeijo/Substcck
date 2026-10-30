import type { FastifyInstance } from 'fastify';
import type { Database } from '../data/database.js';
import { TccValidationError } from '../models/tcc.js';
import { createSemanticSearchService } from '../services/semantic-search.js';
import { parseFilter } from './tcc.js';

export function semanticSearchController(app: FastifyInstance, db: Database) {
  const service = createSemanticSearchService(db);
  app.get<{ Querystring: Record<string, unknown> }>(
    '/api/search',
    async (request, reply) => {
      const { mode, ...query } = request.query;
      if (mode !== 'semantic')
        throw new TccValidationError({
          mode: 'Escolha o modo de busca por significado.',
        });
      reply.header('Cache-Control', 'no-store');
      return service.search(parseFilter(query));
    },
  );
}
