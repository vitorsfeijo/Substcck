import type { PlatformHealth } from '../models/platform';

export async function getPlatformHealth(
  apiUrl: string,
  signal: AbortSignal,
): Promise<PlatformHealth> {
  const response = await fetch(`${apiUrl}/health`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) throw new Error('Serviço indisponível');

  const health: unknown = await response.json();
  if (
    typeof health !== 'object' ||
    health === null ||
    !('status' in health) ||
    health.status !== 'ok' ||
    !('service' in health) ||
    health.service !== 'subtccstack-api' ||
    !('database' in health) ||
    health.database !== 'ok' ||
    !('environment' in health) ||
    !['development', 'production'].includes(String(health.environment))
  ) {
    throw new Error('Resposta de serviço inválida');
  }

  return {
    status: 'ok',
    service: 'subtccstack-api',
    database: 'ok',
    environment: health.environment as PlatformHealth['environment'],
  };
}
