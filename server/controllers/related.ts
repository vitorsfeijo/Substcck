import type { FastifyInstance } from 'fastify';
import type { Database } from '../data/database.js';
import { createRelatedRepository } from '../repositories/related.js';

export function relatedController(app: FastifyInstance, db: Database) {
  const repository = createRelatedRepository(db);
  app.get<{ Params: { id: string } }>(
    '/api/tccs/:id/related',
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return repository.findRelated(request.params.id);
    },
  );
}
