import type { SqlConnection } from '../data/database.js';

export interface PlatformRepository {
  isReady(): Promise<boolean>;
}

export function createPlatformRepository(
  db: SqlConnection,
): PlatformRepository {
  return {
    async isReady() {
      const result = await db.query<{ value: string }>(
        'SELECT value FROM platform_metadata WHERE key = $1',
        ['application'],
      );
      return result.rows[0]?.value === 'subtccstack';
    },
  };
}
