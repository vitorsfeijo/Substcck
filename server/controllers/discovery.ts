import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.js';
import type { Database } from '../data/database.js';
import { allowedOrigin } from '../auth/access.js';
import { createDiscoveryRepository } from '../repositories/discovery.js';
import { digestToken } from '../repositories/sessions.js';

export function discoveryController(
  app: FastifyInstance,
  db: Database,
  config: ServerConfig,
) {
  const repository = createDiscoveryRepository(db);
  const secure = config.environment === 'production';
  const cookieName = secure ? '__Host-substcck_visitor' : 'substcck_visitor';
  const visitorToken = (request: FastifyRequest) => {
    const previous = request.cookies[cookieName];
    return {
      previous,
      token:
        previous && /^[A-Za-z0-9_-]{43}$/.test(previous)
          ? previous
          : randomBytes(32).toString('base64url'),
    };
  };
  const issueCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(cookieName, token, {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
    });
  // A direct reader establishes one browser session before StrictMode can send view POSTs.
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.method !== 'GET' ||
      !/^\/api\/tccs\/[^/?]+(?:\?[^#]*)?$/.test(request.url)
    )
      return;
    const { previous, token } = visitorToken(request);
    if (token !== previous) issueCookie(reply, token);
    reply.header('Cache-Control', 'private, no-store');
  });
  app.get('/api/feed', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return repository.feed();
  });
  app.get('/api/discovery-options', async () => repository.options());
  app.post<{ Params: { id: string } }>(
    '/api/tccs/:id/views',
    {
      schema: {
        body: { type: 'object', additionalProperties: false, properties: {} },
      },
      preHandler: async (request, reply) => {
        if (!allowedOrigin(request, config))
          return reply.code(403).send({
            code: 'ORIGIN_REJECTED',
            message: 'Esta origem não pode registrar a leitura.',
          });
      },
    },
    async (request, reply) => {
      const { previous, token } = visitorToken(request);
      const result = await repository.recordView(
        request.params.id,
        digestToken(token),
      );
      if (token !== previous) issueCookie(reply, token);
      reply.header('Cache-Control', 'private, no-store');
      return result;
    },
  );
}
