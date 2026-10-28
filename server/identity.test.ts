import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createOidcAdapter, identityFromClaims } from './auth/oidc.js';
import {
  developmentPersonas,
  getDevelopmentIdentity,
} from './auth/development.js';
import { openDatabase, type Database } from './data/database.js';
import type { VerifiedIdentity } from './models/auth.js';
import { createIdentityRepository } from './repositories/identity.js';

describe('verified identity persistence', () => {
  let db: Database;
  beforeAll(async () => {
    db = await openDatabase({ dataDir: 'memory://' });
    await db.exec(
      await readFile(resolve('server/db/migrations/002_identity.sql'), 'utf8'),
    );
  });
  afterAll(async () => {
    await db?.close();
  });

  it('keeps a stable user for issuer/subject and updates provider-verified profile', async () => {
    const repository = createIdentityRepository(db);
    const identity = getDevelopmentIdentity('author');
    const first = await repository.upsert(identity);
    const updated = await repository.upsert({
      ...identity,
      name: 'Nome atualizado',
    });
    expect(updated.id).toBe(first.id);
    expect(updated.name).toBe('Nome atualizado');
    expect(await repository.findById(first.id)).toEqual(updated);
    const count = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users WHERE issuer = $1 AND subject = $2',
      [identity.issuer, identity.subject],
    );
    expect(count.rows[0]?.count).toBe(1);
    expect(updated).not.toHaveProperty('issuer');
    expect(updated).not.toHaveProperty('subject');

    const otherIssuer = await repository.upsert({
      ...identity,
      issuer: 'https://another-verified-issuer.example',
    });
    expect(otherIssuer.id).not.toBe(first.id);
  });

  it('preserves opaque subjects so surrounding whitespace cannot merge identities', async () => {
    const repository = createIdentityRepository(db);
    const commonClaims = {
      iss: 'https://opaque-subject.example',
      sub: 'opaque-identifier',
      name: 'Verified student',
      email: 'student@example.invalid',
      email_verified: true,
      preferred_username: 'verified-login',
      role: 'student',
      enrollment: '123456',
    };
    const plain = identityFromClaims(commonClaims, {
      issuer: commonClaims.iss,
    });
    const spaced = identityFromClaims(
      { ...commonClaims, sub: ' opaque-identifier ' },
      { issuer: commonClaims.iss },
    );
    expect(spaced.issuer).toBe(commonClaims.iss);
    expect(spaced.subject).toBe(' opaque-identifier ');
    const first = await repository.upsert(plain);
    const second = await repository.upsert(spaced);
    expect(second.id).not.toBe(first.id);
    expect((await repository.upsert(spaced)).id).toBe(second.id);
  });

  it('does not accept an unrecognized role or missing institutional affiliation', async () => {
    const repository = createIdentityRepository(db);
    const identity = getDevelopmentIdentity('researcher');
    await expect(
      repository.upsert({
        ...identity,
        role: 'administrator',
      } as unknown as VerifiedIdentity),
    ).rejects.toThrow(/não autorizado/);
    await expect(
      repository.upsert({ ...identity, enrollment: ' ' }),
    ).rejects.toThrow(/matrícula/);
    await expect(
      repository.upsert({
        ...getDevelopmentIdentity('professor'),
        department: undefined,
      }),
    ).rejects.toThrow(/departamento/);
    await expect(
      db.query(
        'INSERT INTO users (id, issuer, subject, name, email, institutional_login, role, enrollment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          'missing-affiliation',
          'test',
          'bad-profile',
          'Profile',
          'profile@example.invalid',
          'profile',
          'student',
          null,
        ],
      ),
    ).rejects.toThrow();
  });

  it('persists distinct development identities with explicit simulated profiles', async () => {
    const repository = createIdentityRepository(db);
    const users = await Promise.all(
      Object.keys(developmentPersonas).map((persona) =>
        repository.upsert(getDevelopmentIdentity(persona)),
      ),
    );
    expect(new Set(users.map((user) => user.id)).size).toBe(3);
    expect(users.map((user) => user.role)).toEqual([
      'student',
      'student',
      'professor',
    ]);
    expect(users.every((user) => user.name.includes('simulação'))).toBe(true);
    expect(() => getDevelopmentIdentity('__proto__')).toThrow(/inválida/);
    expect(() => getDevelopmentIdentity('unknown')).toThrow(/inválida/);
    const copy = getDevelopmentIdentity('author');
    copy.name = 'Changed outside adapter';
    expect(getDevelopmentIdentity('author').name).toContain('simulação');
  });
});

describe('OIDC authorization code adapter with controlled issuer responses', () => {
  it('validates discovery, PKCE, state, nonce and JWT signature without external calls', async () => {
    const issuer = 'https://verified-identity.example';
    const redirectUri = 'https://api.example/auth/callback';
    const attempt = {
      state: 'state-from-server-session',
      nonce: 'nonce-from-server-session',
      codeVerifier:
        'a-strong-verifier-stored-on-the-server-and-not-in-the-browser',
    };
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = {
      ...key.publicKey.export({ format: 'jwk' }),
      kid: 'test-key',
      use: 'sig',
      alg: 'RS256',
    };
    let returnedNonce = attempt.nonce;
    let validSignature = true;
    let tokenOverrides: Record<string, unknown> = {};
    let tokenRequests = 0;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === 'string' || input instanceof URL
            ? String(input)
            : input.url,
        );
        if (url.href === `${issuer}/.well-known/openid-configuration`) {
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
            code_challenge_methods_supported: ['S256'],
          });
        }
        if (url.href === `${issuer}/jwks`)
          return Response.json({ keys: [jwk] });
        if (url.href === `${issuer}/token`) {
          tokenRequests++;
          const body = new URLSearchParams(String(init?.body));
          expect(body.get('code_verifier')).toBe(attempt.codeVerifier);
          expect(body.get('redirect_uri')).toBe(redirectUri);
          const now = Math.floor(Date.now() / 1000);
          const header = Buffer.from(
            JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
          ).toString('base64url');
          const claims = Buffer.from(
            JSON.stringify({
              iss: issuer,
              sub: 'verified-student',
              aud: 'subtccstack',
              iat: now,
              exp: now + 120,
              nonce: returnedNonce,
              name: 'Verified student',
              email: 'student@example.invalid',
              email_verified: true,
              preferred_username: 'verified-login',
              role: 'student',
              enrollment: '654321',
              ...tokenOverrides,
            }),
          ).toString('base64url');
          const payload = `${header}.${claims}`;
          const signature = sign(
            'RSA-SHA256',
            Buffer.from(payload),
            validSignature ? key.privateKey : otherKey.privateKey,
          ).toString('base64url');
          return Response.json({
            access_token: 'test-access-token',
            token_type: 'Bearer',
            expires_in: 120,
            id_token: `${payload}.${signature}`,
          });
        }
        throw new Error(`Unexpected identity request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const adapter = await createOidcAdapter({
        issuer,
        clientId: 'subtccstack',
        clientSecret: 'test-only-secret',
        redirectUri,
      });
      const authorization = await adapter.authorizationUrl(attempt);
      expect(authorization.searchParams.get('code_challenge_method')).toBe(
        'S256',
      );
      expect(authorization.searchParams.get('code_challenge')).not.toBe(
        attempt.codeVerifier,
      );
      expect(authorization.searchParams.get('state')).toBe(attempt.state);
      expect(authorization.searchParams.get('nonce')).toBe(attempt.nonce);
      const callback = new URL(
        `${redirectUri}?code=example-code&state=${attempt.state}`,
      );
      expect(await adapter.callback(callback, attempt)).toMatchObject({
        issuer,
        subject: 'verified-student',
        enrollment: '654321',
      });
      expect(tokenRequests).toBe(1);
      await expect(
        adapter.callback(
          new URL(`${redirectUri}?code=example-code&state=wrong`),
          attempt,
        ),
      ).rejects.toThrow();
      expect(tokenRequests).toBe(1);
      returnedNonce = 'incorrect-nonce';
      await expect(adapter.callback(callback, attempt)).rejects.toThrow();
      returnedNonce = attempt.nonce;
      validSignature = false;
      await expect(adapter.callback(callback, attempt)).rejects.toThrow();
      validSignature = true;
      for (const override of [
        { aud: 'different-client' },
        { exp: Math.floor(Date.now() / 1000) - 3600 },
        { iss: 'https://untrusted-issuer.example' },
      ]) {
        tokenOverrides = override;
        await expect(adapter.callback(callback, attempt)).rejects.toThrow();
      }
      await expect(
        adapter.callback(
          new URL(
            `https://attacker.example/auth/callback?code=x&state=${attempt.state}`,
          ),
          attempt,
        ),
      ).rejects.toThrow(/inválido/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects non-HTTPS configuration before discovery', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        createOidcAdapter({
          issuer: 'http://issuer.example',
          clientId: 'client',
          clientSecret: 'secret',
          redirectUri: 'https://api.example/callback',
        }),
      ).rejects.toThrow(/HTTPS/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('claims from the verified OIDC token', () => {
  const claims = {
    iss: 'https://institution.example',
    sub: 'stable-subject',
    name: 'Estudante verificado',
    email: 'student@institution.example',
    email_verified: true,
    preferred_username: '123456',
    role: 'student',
    enrollment: '123456',
  };
  const options = { issuer: claims.iss };

  it('maps only explicit provider-verified affiliation and supports named claims', () => {
    expect(identityFromClaims(claims, options)).toMatchObject({
      issuer: claims.iss,
      subject: claims.sub,
      role: 'student',
      enrollment: '123456',
    });
    const professor = identityFromClaims(
      {
        ...claims,
        affiliation: 'professor',
        organizational_unit: 'INF',
        account: 'prof-123',
      },
      {
        ...options,
        roleClaim: 'affiliation',
        departmentClaim: 'organizational_unit',
        loginClaim: 'account',
      },
    );
    expect(professor.role).toBe('professor');
    expect(professor.department).toBe('INF');
    expect(professor.institutionalLogin).toBe('prof-123');
  });

  it('rejects domain-only identity, wrong issuer, unverified email and missing profile', () => {
    for (const patch of [
      { role: undefined },
      { role: 'administrator' },
      { role: ['student'] },
      { iss: 'https://untrusted.example' },
      { email_verified: false },
      { email_verified: undefined },
      { sub: '' },
      { name: null },
      { preferred_username: undefined },
      { enrollment: '' },
      { role: 'professor', department: undefined },
    ]) {
      expect(() =>
        identityFromClaims({ ...claims, ...patch }, options),
      ).toThrow();
    }
  });
});
