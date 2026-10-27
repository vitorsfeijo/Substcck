import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { mkdir } from 'node:fs/promises';
import type { ServerConfig } from '../config.js';

export interface SqlConnection {
  query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

export interface Database extends SqlConnection {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(
  config: Pick<ServerConfig, 'databaseUrl' | 'dataDir'>,
): Promise<Database> {
  if (!config.databaseUrl) {
    if (config.dataDir !== 'memory://') {
      await mkdir(config.dataDir, { recursive: true });
    }
    const db = await PGlite.create(config.dataDir);
    return {
      query: (sql, params) => db.query(sql, params),
      exec: async (sql) => {
        await db.exec(sql);
      },
      transaction: (work) =>
        db.transaction((tx) =>
          work({
            query: (sql, params) => tx.query(sql, params),
            exec: async (sql) => {
              await tx.exec(sql);
            },
          }),
        ),
      close: () => db.close(),
    };
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: async (sql) => {
      await pool.query(sql);
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work({
          query: (sql, params) => client.query(sql, params),
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
