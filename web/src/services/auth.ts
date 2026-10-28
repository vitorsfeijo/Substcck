import type {
  AuthConfig,
  AuthMode,
  DevelopmentPersona,
  Session,
  User,
} from '../models/auth';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mode(value: unknown): value is AuthMode {
  return value === 'disabled' || value === 'development' || value === 'oidc';
}

function user(value: unknown): value is User {
  return (
    record(value) &&
    ['id', 'name', 'email', 'institutionalLogin'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0,
    ) &&
    (value.role === 'student' || value.role === 'professor') &&
    (value.enrollment === null || typeof value.enrollment === 'string') &&
    (value.department === null || typeof value.department === 'string')
  );
}

function session(value: unknown): Session {
  if (
    !record(value) ||
    !mode(value.mode) ||
    (value.user !== null && !user(value.user)) ||
    (value.user !== null &&
      (typeof value.csrfToken !== 'string' || !value.csrfToken)) ||
    (value.user === null && value.csrfToken !== null)
  ) {
    throw new Error('Resposta de sessão inválida.');
  }
  return value as unknown as Session;
}

async function request(base: string, path: string, options: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...options.headers },
  });
}

export async function getAuthConfig(
  base: string,
  signal: AbortSignal,
): Promise<AuthConfig> {
  const response = await request(base, '/auth/config', { signal });
  if (!response.ok)
    throw new Error('Não foi possível consultar as opções de acesso.');
  const value: unknown = await response.json();
  if (
    !record(value) ||
    !mode(value.mode) ||
    (value.loginUrl !== null && typeof value.loginUrl !== 'string')
  ) {
    throw new Error('Configuração de acesso inválida.');
  }
  if (value.mode === 'oidc') {
    if (typeof value.loginUrl !== 'string')
      throw new Error('Acesso institucional não configurado.');
    const api = new URL(base, window.location.href);
    const login = new URL(value.loginUrl, api);
    if (
      !['http:', 'https:'].includes(login.protocol) ||
      login.origin !== api.origin
    ) {
      throw new Error('Endereço de acesso inválido.');
    }
    value.loginUrl = login.href;
  }
  if (value.mode === 'development') {
    if (
      !Array.isArray(value.developmentUsers) ||
      !value.developmentUsers.length ||
      !value.developmentUsers.every(
        (entry) =>
          record(entry) &&
          ['author', 'researcher', 'professor'].includes(String(entry.id)) &&
          typeof entry.name === 'string' &&
          (entry.role === 'student' || entry.role === 'professor'),
      )
    ) {
      throw new Error('Perfis de desenvolvimento inválidos.');
    }
  }
  return value as unknown as AuthConfig;
}

export async function getSession(
  base: string,
  signal: AbortSignal,
): Promise<Session | null> {
  const response = await request(base, '/auth/session', { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Não foi possível verificar sua sessão.');
  return session(await response.json());
}

export async function enterDevelopment(
  base: string,
  persona: DevelopmentPersona,
): Promise<Session> {
  const response = await request(base, '/auth/development', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  });
  if (!response.ok)
    throw new Error('Não foi possível iniciar a simulação local.');
  return session(await response.json());
}

export async function endSession(
  base: string,
  csrfToken: string,
): Promise<void> {
  const response = await request(base, '/auth/logout', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { 'X-CSRF-Token': csrfToken },
  });
  if (response.status !== 401 && !response.ok)
    throw new Error('Não foi possível encerrar sua sessão. Tente novamente.');
}
