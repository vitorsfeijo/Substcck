import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { ServerConfig } from './config.js';
import { platformController } from './controllers/platform.js';
import type { PlatformRepository } from './repositories/platform.js';

export async function createApp(
  config: ServerConfig,
  repository: PlatformRepository,
) {
  const app = Fastify({
    logger: config.environment !== 'test',
    bodyLimit: 1024 * 1024,
  });
  await app.register(cors, { origin: config.corsOrigins, methods: ['GET'] });
  platformController(app, repository, config);
  return app;
}
