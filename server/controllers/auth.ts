import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../data/database.js';
import type { ServerConfig } from '../config.js';
import type {
  IdentityAdapter,
  User,
  VerifiedIdentity,
} from '../models/auth.js';
import { createIdentityRepository } from '../repositories/identity.js';
import { createSessionRepository } from '../repositories/sessions.js';
import {
  developmentPersonas,
  getDevelopmentIdentity,
} from '../auth/development.js';
import {
  allowedOrigin,
  equalToken,
  requireCsrf,
  requireUser,
} from '../auth/access.js';

export async function authController(
  app: FastifyInstance,
  config: ServerConfig,
  db?: Database,
  adapter?: IdentityAdapter,
) {
  if (config.auth.mode !== 'disabled' && !db)
    throw new Error('Autenticação exige persistência.');
  if (config.auth.mode === 'oidc' && !adapter)
    throw new Error('Adaptador OIDC não configurado.');
  const identities = db ? createIdentityRepository(db) : null;
  const sessions = db ? createSessionRepository(db) : null;
  const secure = config.environment === 'production';
  const cookieName = secure
    ? '__Host-subtccstack_session'
    : 'subtccstack_session';
  const attemptCookie = secure ? '__Host-subtccstack_oidc' : 'subtccstack_oidc';
  const options = {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: secure ? ('none' as const) : ('lax' as const),
  };
  const mode = config.auth.mode;
  const payload = (user: User | null, csrfToken: string | null) => ({
    user,
    csrfToken,
    mode,
  });

  app.decorateRequest('identity', null);
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/api/auth') ||
      request.url.startsWith('/api/me')
    )
      reply.header('Cache-Control', 'no-store');
    if (mode === 'disabled' || !sessions) return;
    const session = await sessions.find(request.cookies[cookieName]);
    if (!session) return;
    const expectedIssuer =
      mode === 'development'
        ? 'urn:subtccstack:development'
        : config.auth.oidc?.issuer;
    if (session.issuer === expectedIssuer)
      request.identity = { user: session.user, csrfToken: session.csrfToken };
  });
  const signIn = async (
    identity: VerifiedIdentity,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const user = await identities!.upsert(identity);
    await sessions!.revoke(request.cookies[cookieName]);
    await sessions!.prune();
    const session = await sessions!.create(user, config.auth.sessionTtlSeconds);
    reply.setCookie(cookieName, session.token, {
      ...options,
      maxAge: config.auth.sessionTtlSeconds,
    });
    return payload(user, session.csrfToken);
  };

  app.get('/api/auth/config', async () => ({
    mode,
    loginUrl: mode === 'oidc' ? `${config.auth.publicApiUrl}/auth/login` : null,
    ...(mode === 'development'
      ? {
          developmentUsers: Object.entries(developmentPersonas).map(
            ([id, user]) => ({ id, name: user.name, role: user.role }),
          ),
        }
      : {}),
  }));
  app.get('/api/auth/session', async (request) =>
    payload(
      request.identity?.user || null,
      request.identity?.csrfToken || null,
    ),
  );
  app.get('/api/me', { preHandler: requireUser }, async (request) => ({
    user: request.identity!.user,
  }));

  if (mode === 'development') {
    app.post<{ Body: { persona: string } }>(
      '/api/auth/development',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['persona'],
            properties: {
              persona: {
                type: 'string',
                enum: ['author', 'researcher', 'professor'],
              },
            },
          },
        },
      },
      async (request, reply) => {
        if (!allowedOrigin(request, config))
          return reply.code(403).send({
            code: 'ORIGIN_REJECTED',
            message: 'Acesso local não autorizado.',
          });
        return signIn(
          getDevelopmentIdentity(request.body.persona),
          request,
          reply,
        );
      },
    );
  }
  app.post(
    '/api/auth/logout',
    { preHandler: (request, reply) => requireCsrf(request, reply, config) },
    async (request, reply) => {
      await sessions!.revoke(request.cookies[cookieName]);
      reply.clearCookie(cookieName, options);
      return payload(null, null);
    },
  );

  if (mode === 'oidc') {
    app.get('/api/auth/login', async (_request, reply) => {
      await sessions!.prune();
      const attempt = await sessions!.createAttempt();
      const url = await adapter!.authorizationUrl(attempt);
      reply.header('Referrer-Policy', 'no-referrer');
      reply.setCookie(attemptCookie, attempt.state, {
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 300,
      });
      return reply.redirect(url.href);
    });
    app.get<{ Querystring: { state?: string } }>(
      '/api/auth/callback',
      async (request, reply) => {
        reply.header('Referrer-Policy', 'no-referrer');
        const state = request.query.state;
        const binding = request.cookies[attemptCookie];
        reply.clearCookie(attemptCookie, {
          path: '/',
          httpOnly: true,
          secure,
          sameSite: 'lax',
        });
        if (
          typeof state !== 'string' ||
          state.length !== 43 ||
          !binding ||
          !equalToken(state, binding)
        )
          return reply.code(401).send({
            code: 'INVALID_LOGIN',
            message: 'A tentativa de acesso é inválida ou expirou.',
          });
        const attempt = await sessions!.consumeAttempt(state);
        if (!attempt)
          return reply.code(401).send({
            code: 'INVALID_LOGIN',
            message: 'A tentativa de acesso é inválida ou expirou.',
          });
        try {
          const url = new URL(config.auth.oidc!.redirectUri);
          url.search = new URL(request.url, config.auth.publicApiUrl).search;
          const identity = await adapter!.callback(url, attempt);
          await signIn(identity, request, reply);
          const frontend = new URL(config.auth.frontendUrl);
          frontend.hash = '/perfil';
          return reply.redirect(frontend.href);
        } catch {
          return reply.code(401).send({
            code: 'INVALID_LOGIN',
            message: 'Não foi possível validar o acesso institucional.',
          });
        }
      },
    );
  }
}
