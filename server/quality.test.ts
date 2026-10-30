import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import type { AttachmentStore } from './models/attachments.js';
import { uploadAttachment } from './attachments/service.js';
import { createPlatformRepository } from './repositories/platform.js';
import { createPublicationService } from './services/publication.js';
import { seedDevelopmentData } from './scripts/seed.js';

const origin = 'http://127.0.0.1:5173';
const config = readConfig({ NODE_ENV: 'test', AUTH_MODE: 'development' });
const objects = new Map<string, Buffer>();
const store: AttachmentStore = {
  async put(key, data) {
    objects.set(key, data);
  },
  async get(key) {
    return { body: objects.get(key)! };
  },
  async remove(key) {
    objects.delete(key);
  },
};
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
let db: Database;
let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
let app: Awaited<ReturnType<typeof createApp>>;
let privateFile: Awaited<ReturnType<typeof uploadAttachment>>;

beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
  fixtures = await seedDevelopmentData(db, { environment: 'test' });
  privateFile = await uploadAttachment(db, store, {
    authorId: fixtures.author.id,
    kind: 'document',
    originalName: 'privado.pdf',
    data: pdf,
  });
  await createPublicationService(db, {
    validate: async () => ({ valid: false, reason: 'unreachable' }),
  }).submit(
    {
      intent: 'draft',
      title: 'M5 conteúdo sigiloso',
      fileId: privateFile.id,
      summary: 'Vocabulário exclusivo confidencial',
      tagIds: [fixtures.tags.redes.id],
    },
    fixtures.author,
    fixtures.works.E!.id,
  );
  app = await createApp(config, createPlatformRepository(db), {
    database: db,
    attachmentStore: store,
    lumeValidator: {
      validate: async () => ({ valid: false, reason: 'unreachable' }),
    },
  });
});
afterAll(async () => {
  await app.close();
  await db.close();
});

async function login(persona: 'author' | 'researcher' | 'professor') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/development',
    headers: { origin },
    payload: { persona },
  });
  expect(response.statusCode).toBe(200);
  return {
    origin,
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
    'x-csrf-token': response.json().csrfToken as string,
  };
}

it('keeps a known draft and its document private across every public discovery entry point', async () => {
  const draftId = fixtures.works.E!.id;
  for (const headers of [
    {},
    await login('researcher'),
    await login('professor'),
    await login('author'),
  ]) {
    for (const url of [`/api/tccs/${draftId}`, `/api/tccs/${draftId}/related`])
      expect((await app.inject({ url, headers })).statusCode).toBe(404);
    for (const url of [
      '/api/feed',
      '/api/tccs',
      '/api/tccs?term=confidencial',
      '/api/search?mode=semantic&term=confidencial',
      `/api/tccs/${fixtures.works.A!.id}/related`,
    ]) {
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(draftId);
      expect(response.body).not.toContain(privateFile.id);
      expect(response.body).not.toContain('M5 conteúdo sigiloso');
    }
  }
  for (const [headers, expected] of [
    [{}, 401],
    [await login('researcher'), 404],
    [await login('professor'), 403],
  ] as const) {
    expect(
      (await app.inject({ url: privateFile.url, headers })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `/api/me/tccs/${draftId}`, headers }))
        .statusCode,
    ).toBe(expected);
  }
  const owner = await login('author');
  const ownDraft = await app.inject({
    url: `/api/me/tccs/${draftId}`,
    headers: owner,
  });
  expect(ownDraft.statusCode).toBe(200);
  expect(ownDraft.headers['cache-control']).toBe('no-store');
  const ownFile = await app.inject({ url: privateFile.url, headers: owner });
  expect(ownFile.statusCode).toBe(200);
  expect(ownFile.rawPayload).toEqual(pdf);
  expect(ownFile.headers['cache-control']).toBe('private, no-store');
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/tccs/${draftId}/views`,
        headers: { origin },
        payload: {},
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await db.query('SELECT id FROM tcc_view_events WHERE tcc_id = $1', [
        draftId,
      ])
    ).rows,
  ).toHaveLength(0);
});

it('denies direct mutations for visitors, professors and a different student without partial writes', async () => {
  const draftId = fixtures.works.E!.id;
  for (const [headers, expected] of [
    [{}, 401],
    [await login('professor'), 403],
  ] as const) {
    for (const operation of [
      {
        method: 'POST' as const,
        url: '/api/tccs',
        payload: { intent: 'draft', title: 'Intrusão' },
      },
      {
        method: 'PUT' as const,
        url: `/api/tccs/${draftId}`,
        payload: { intent: 'draft', title: 'Intrusão' },
      },
      {
        method: 'POST' as const,
        url: '/api/tags',
        payload: { name: 'Intrusão' },
      },
      { method: 'POST' as const, url: '/api/attachments?kind=document' },
      { method: 'DELETE' as const, url: privateFile.url },
    ])
      expect((await app.inject({ ...operation, headers })).statusCode).toBe(
        expected,
      );
  }
  const other = await login('researcher');
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/tccs/${draftId}`,
        headers: other,
        payload: { intent: 'draft', title: 'Intrusão' },
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: 'DELETE',
        url: privateFile.url,
        headers: other,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/tccs',
        headers: other,
        payload: {
          intent: 'draft',
          title: 'Anexo de outra conta',
          fileId: privateFile.id,
        },
      })
    ).statusCode,
  ).toBe(400);
  const owner = await login('author');
  expect(
    (
      await app.inject({
        method: 'DELETE',
        url: privateFile.url,
        headers: owner,
      })
    ).statusCode,
  ).toBe(409);
  const withoutCsrf = { origin, cookie: owner.cookie };
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: `/api/tccs/${draftId}`,
        headers: withoutCsrf,
        payload: { intent: 'draft', title: 'Sem token' },
      })
    ).statusCode,
  ).toBe(403);
  const work = (
    await app.inject({ url: `/api/me/tccs/${draftId}`, headers: owner })
  ).json();
  expect(work.title).toBe('M5 conteúdo sigiloso');
  expect(work.file.id).toBe(privateFile.id);
  expect(
    (await app.inject({ url: '/api/me/tccs', headers: other })).json().total,
  ).toBe(0);
});

it.each([
  {
    name: 'malformed JSON',
    type: 'application/json',
    payload: '{"intent":',
    expected: 400,
    code: 'INVALID_REQUEST',
  },
  {
    name: 'oversized JSON',
    type: 'application/json',
    payload: JSON.stringify({ title: 'x'.repeat(1024 * 1024) }),
    expected: 413,
    code: 'REQUEST_TOO_LARGE',
  },
  {
    name: 'unsupported content type',
    type: 'application/x-substcck-unknown',
    payload: 'invalid',
    expected: 415,
    code: 'UNSUPPORTED_CONTENT_TYPE',
  },
])(
  'reports $name as a recoverable client error',
  async ({ type, payload, expected, code }) => {
    const owner = await login('author');
    const response = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers: { ...owner, 'content-type': type },
      payload,
    });
    expect(response.statusCode).toBe(expected);
    expect(response.json().code).toBe(code);
    expect(response.body).not.toContain('stack');
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  },
);
