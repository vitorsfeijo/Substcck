export interface ServerConfig {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigins: string[];
  databaseUrl?: string;
  dataDir: string;
  storage: {
    driver: 'local' | 's3' | 'unconfigured';
    localDirectory: string;
    s3?: {
      endpoint: string;
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    };
  };
  auth: {
    mode: 'disabled' | 'development' | 'oidc';
    frontendUrl: string;
    publicApiUrl: string;
    sessionTtlSeconds: number;
    oidc?: {
      issuer: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      roleClaim: string;
      enrollmentClaim: string;
      departmentClaim: string;
      loginClaim: string;
    };
  };
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
  const mode = env.AUTH_MODE || 'disabled';
  if (!['disabled', 'development', 'oidc'].includes(mode))
    throw new Error('AUTH_MODE inválido.');
  const host = env.HOST || '127.0.0.1';
  const frontendUrl = env.FRONTEND_URL || 'http://127.0.0.1:5173/Substcck/';
  const publicApiUrl = (
    env.PUBLIC_API_URL || 'http://127.0.0.1:3001/api'
  ).replace(/\/+$/, '');
  const frontend = new URL(frontendUrl);
  const api = new URL(publicApiUrl);
  if (
    ![frontend, api].every(
      (url) =>
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
    )
  ) {
    throw new Error(
      'FRONTEND_URL e PUBLIC_API_URL devem ser URLs HTTP(S) sem credenciais, query ou fragmento.',
    );
  }
  const loopback = (hostname: string) =>
    ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
  if (
    mode === 'development' &&
    (environment === 'production' ||
      !loopback(host) ||
      !loopback(api.hostname) ||
      !loopback(frontend.hostname) ||
      corsOrigins.some((origin) => !loopback(new URL(origin).hostname)))
  ) {
    throw new Error(
      'Autenticação de desenvolvimento exige ambiente não produtivo e acesso exclusivamente local.',
    );
  }
  const sessionTtlSeconds = Number(env.SESSION_TTL_SECONDS || 3600);
  if (
    !Number.isInteger(sessionTtlSeconds) ||
    sessionTtlSeconds < 60 ||
    sessionTtlSeconds > 28800
  )
    throw new Error('SESSION_TTL_SECONDS deve estar entre 60 e 28800.');
  let oidc: ServerConfig['auth']['oidc'];
  if (mode === 'oidc') {
    for (const key of [
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
      'FRONTEND_URL',
      'PUBLIC_API_URL',
    ]) {
      if (!env[key]) throw new Error(`OIDC exige ${key}.`);
    }
    const issuer = new URL(env.OIDC_ISSUER!);
    const redirect = new URL(env.OIDC_REDIRECT_URI!);
    if (
      issuer.protocol !== 'https:' ||
      issuer.username ||
      issuer.password ||
      issuer.hash ||
      issuer.search ||
      redirect.href !== `${publicApiUrl}/auth/callback`
    )
      throw new Error('Issuer ou callback OIDC inválido.');
    if (
      environment === 'production' &&
      (frontend.protocol !== 'https:' || api.protocol !== 'https:')
    )
      throw new Error('OIDC em produção exige HTTPS.');
    if (!corsOrigins.includes(frontend.origin))
      throw new Error('CORS_ORIGINS deve permitir a origem do frontend OIDC.');
    oidc = {
      issuer: env.OIDC_ISSUER!,
      clientId: env.OIDC_CLIENT_ID!,
      clientSecret: env.OIDC_CLIENT_SECRET!,
      redirectUri: redirect.href,
      roleClaim: env.OIDC_ROLE_CLAIM || 'role',
      enrollmentClaim: env.OIDC_ENROLLMENT_CLAIM || 'enrollment',
      departmentClaim: env.OIDC_DEPARTMENT_CLAIM || 'department',
      loginClaim: env.OIDC_LOGIN_CLAIM || 'preferred_username',
    };
  }
  const driver =
    env.STORAGE_DRIVER ||
    (environment === 'production' ? 'unconfigured' : 'local');
  if (!['local', 's3', 'unconfigured'].includes(driver))
    throw new Error('STORAGE_DRIVER inválido.');
  if (environment === 'production' && driver === 'local')
    throw new Error(
      'Produção exige armazenamento S3 privado; o disco local é exclusivo de desenvolvimento.',
    );
  let s3: ServerConfig['storage']['s3'];
  if (driver === 's3') {
    for (const key of [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]) {
      if (!env[key]) throw new Error(`Armazenamento S3 exige ${key}.`);
    }
    const endpoint = new URL(env.S3_ENDPOINT!);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error('S3_ENDPOINT deve usar HTTPS e não conter credenciais.');
    s3 = {
      endpoint: endpoint.href,
      bucket: env.S3_BUCKET!,
      region: env.S3_REGION || 'auto',
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    };
  }
  return {
    environment: environment as ServerConfig['environment'],
    host,
    port,
    corsOrigins,
    databaseUrl: env.DATABASE_URL || undefined,
    dataDir: env.PGLITE_DATA_DIR || './.cache/data/dev',
    storage: {
      driver: driver as ServerConfig['storage']['driver'],
      localDirectory: env.UPLOAD_DIRECTORY || './.cache/uploads',
      s3,
    },
    auth: {
      mode: mode as ServerConfig['auth']['mode'],
      frontendUrl,
      publicApiUrl,
      sessionTtlSeconds,
      oidc,
    },
  };
}
