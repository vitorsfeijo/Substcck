export interface ServerConfig {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigins: string[];
  databaseUrl?: string;
  dataDir: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const environment = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT inválida.');
  }
  const corsOrigins = (
    env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error(
        'CORS_ORIGINS deve conter origens HTTP(S) exatas, sem caminho.',
      );
    }
  }
  if (
    environment === 'production' &&
    (!env.DATABASE_URL || !env.CORS_ORIGINS)
  ) {
    throw new Error('Produção exige DATABASE_URL e CORS_ORIGINS explícitas.');
  }
  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    throw new Error('DATABASE_URL deve usar PostgreSQL.');
  }
  return {
    environment: environment as ServerConfig['environment'],
    host: env.HOST || '127.0.0.1',
    port,
    corsOrigins,
    databaseUrl: env.DATABASE_URL || undefined,
    dataDir: env.PGLITE_DATA_DIR || './data/development',
  };
}
