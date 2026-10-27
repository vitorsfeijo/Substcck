import type { PlatformHealth } from '../models/platform.js';
import type { PlatformRepository } from '../repositories/platform.js';

export async function getPlatformHealth(
  repository: PlatformRepository,
  environment: PlatformHealth['environment'],
): Promise<PlatformHealth> {
  let ready = false;
  try {
    ready = await repository.isReady();
  } catch {
    // Public health output deliberately omits SQL and connection credentials.
  }
  return {
    status: ready ? 'ok' : 'unavailable',
    service: 'subtccstack-api',
    database: ready ? 'ok' : 'unavailable',
    environment,
  };
}
