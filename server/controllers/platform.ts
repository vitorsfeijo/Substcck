import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config.js';
import type { PlatformRepository } from '../repositories/platform.js';
import { getPlatformHealth } from '../services/platform.js';

export function platformController(
  app: FastifyInstance,
  repository: PlatformRepository,
  config: ServerConfig,
) {
  app.get('/api/health', async (_request, reply) => {
    const health = await getPlatformHealth(repository, config.environment);
    reply.header('Cache-Control', 'no-store');
    return reply.code(health.status === 'ok' ? 200 : 503).send(health);
  });
}
