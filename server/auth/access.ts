import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.js';
import type { User } from '../models/auth.js';

export interface RequestIdentity {
  user: User;
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: RequestIdentity | null;
  }
}

export function equalToken(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.identity)
    return reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Entre para acessar sua conta.',
    });
}

export async function requireStudent(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.identity) return requireUser(request, reply);
  if (request.identity.user.role !== 'student')
    return reply.code(403).send({
      code: 'FORBIDDEN',
      message: 'Esta ação é exclusiva do aluno autor.',
    });
}

export function allowedOrigin(request: FastifyRequest, config: ServerConfig) {
  const origin = request.headers.origin;
  return typeof origin === 'string' && config.corsOrigins.includes(origin);
}

export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ServerConfig,
) {
  if (!request.identity) return requireUser(request, reply);
  const token = request.headers['x-csrf-token'];
  if (
    !allowedOrigin(request, config) ||
    typeof token !== 'string' ||
    !equalToken(token, request.identity.csrfToken)
  ) {
    return reply.code(403).send({
      code: 'CSRF_REJECTED',
      message: 'A sessão não autorizou esta requisição.',
    });
  }
}
