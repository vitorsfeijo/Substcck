import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { createPlatformRepository } from './repositories/platform.js';
import { seedDevelopmentData } from './scripts/seed.js';
import { uploadAttachment } from './attachments/service.js';
import type { AttachmentStore } from './models/attachments.js';
import type { LumeValidator } from './services/lume.js';

let db: Database;
let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
let image: Buffer;
const binary = new Map<string, Buffer>();
const store: AttachmentStore = {
  async put(key, data) {
    binary.set(key, data);
  },
  async get(key) {
    const body = binary.get(key);
    if (!body) throw new Error('Missing fixture');
    return { body };
  },
  async remove(key) {
    binary.delete(key);
  },
};
let accessible = true;
let checks = 0;
const validator: LumeValidator = {
  async validate(url) {
    checks++;
    return accessible
      ? { valid: true, url }
      : { valid: false, reason: 'unreachable' };
  },
};
const origin = 'http://127.0.0.1:5173';
const config = readConfig({ NODE_ENV: 'test', AUTH_MODE: 'development' });
beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
  fixtures = await seedDevelopmentData(db, { environment: 'test' });
  image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#d74432' },
  })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await db.close();
});
const buildApp = () =>
  createApp(config, createPlatformRepository(db), {
    database: db,
    attachmentStore: store,
    lumeValidator: validator,
  });
type App = Awaited<ReturnType<typeof buildApp>>;
async function login(app: App, persona = 'author') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/development',
    headers: { origin },
    payload: { persona },
  });
  expect(response.statusCode).toBe(200);
  return {
    origin,
    cookie: String(response.headers['set-cookie']).split(';')[0],
    'x-csrf-token': response.json().csrfToken as string,
  };
}
function body(title: string) {
  return {
    intent: 'publish',
    title,
    summary: 'Um resumo acessível para o CT01.',
    year: 2025,
    semester: 2,
    defendedAt: '2025-11-15',
    advisorId: fixtures.carlos.id,
    lumeUrl: 'https://lume.ufrgs.br/handle/10183/ct01',
    tagIds: [fixtures.tags.redes.id],
    mediaIds: [] as string[],
    fileId: null as string | null,
  };
}
async function stageImage(authorId = fixtures.author.id) {
  return uploadAttachment(db, store, {
    authorId,
    kind: 'image',
    originalName: 'demonstracao.png',
    data: image,
  });
}

it('rejects malformed required text as validation errors without calling LUME', async () => {
  const app = await buildApp();
  try {
    const headers = await login(app);
    const before = checks;
    for (const field of ['title', 'summary', 'lumeUrl']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tccs',
        headers,
        payload: { ...body('Entrada malformada'), [field]: { trim: true } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    }
    expect(checks).toBe(before);
  } finally {
    await app.close();
  }
});

it('publishes CT01 with real attachment references, preserves edits on failure and retries creation safely', async () => {
  accessible = true;
  const app = await buildApp();
  try {
    const headers = await login(app);
    const first = await stageImage();
    const second = await stageImage();
    const document = await uploadAttachment(db, store, {
      authorId: fixtures.author.id,
      kind: 'document',
      originalName: 'trabalho.pdf',
      data: Buffer.from('%PDF-1.4\n1 0 obj<</Type /Catalog>>endobj\n%%EOF\n'),
    });
    const payload = {
      ...body('Detecção de anomalias em redes veiculares'),
      mediaIds: [first.id, second.id],
      fileId: document.id,
    };
    const key = randomUUID();
    const created = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers: { ...headers, 'idempotency-key': key },
      payload,
    });
    expect(created.statusCode).toBe(201);
    const work = created.json().tcc;
    expect(created.json().message).toBe('TCC publicado com sucesso!');
    expect(work.status).toBe('PUBLICADO');
    expect(work.media).toHaveLength(2);
    expect(work.file.path).toBe(`/api/attachments/${document.id}`);
    expect(created.body).not.toContain('storageKey');
    expect(
      (await app.inject(`/api/tccs?tagIds=${fixtures.tags.redes.id}`))
        .json()
        .items.some((item: { id: string }) => item.id === work.id),
    ).toBe(true);
    expect((await app.inject(`/api/attachments/${first.id}`)).statusCode).toBe(
      200,
    );
    const download = await app.inject(`/api/attachments/${document.id}`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.body).toContain('%PDF-');
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/attachments/${first.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(409);
    accessible = false;
    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/tccs/${work.id}`,
      headers,
      payload: { ...payload, title: 'Não deve substituir' },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().canSaveDraft).toBe(false);
    expect((await app.inject(`/api/tccs/${work.id}`)).json().title).toBe(
      payload.title,
    );
    const callsBeforeRetry = checks;
    const replay = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers: { ...headers, 'idempotency-key': key },
      payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().tcc.id).toBe(work.id);
    expect(checks).toBe(callsBeforeRetry);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers: { ...headers, 'idempotency-key': key },
          payload: { ...payload, title: 'Outra requisição' },
        })
      ).statusCode,
    ).toBe(409);
    accessible = true;
    const edited = await app.inject({
      method: 'PUT',
      url: `/api/tccs/${work.id}`,
      headers,
      payload: {
        ...payload,
        title: 'Pesquisa revisada',
        mediaIds: [second.id],
        fileId: null,
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().tcc.publishedAt).toBe(work.publishedAt);
    expect((await app.inject(`/api/attachments/${first.id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ url: `/api/attachments/${first.id}`, headers }))
        .statusCode,
    ).toBe(200);
    expect((await app.inject(`/api/attachments/${second.id}`)).statusCode).toBe(
      200,
    );
  } finally {
    await app.close();
  }
});

it('offers but never automatically saves FA02; explicit drafts remain private with their attachments', async () => {
  accessible = false;
  const app = await buildApp();
  try {
    const headers = await login(app);
    const image = await stageImage();
    const payload = {
      ...body('Rascunho privado do FA02'),
      lumeUrl: 'https://exemplo.com/tcc',
      mediaIds: [image.id],
    };
    const before = (await app.inject({ url: '/api/me/tccs', headers })).json()
      .total;
    const failed = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers,
      payload,
    });
    expect(failed.statusCode).toBe(422);
    expect(failed.json().canSaveDraft).toBe(true);
    expect(
      (await app.inject({ url: '/api/me/tccs', headers })).json().total,
    ).toBe(before);
    const saved = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers,
      payload: { ...payload, intent: 'draft' },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().message).toBe('Rascunho salvo com sucesso');
    const work = saved.json().tcc;
    expect(work.title).toBe(payload.title);
    expect((await app.inject(`/api/tccs/${work.id}`)).statusCode).toBe(404);
    expect((await app.inject(`/api/attachments/${image.id}`)).statusCode).toBe(
      404,
    );
    const other = await login(app, 'researcher');
    expect(
      (
        await app.inject({
          url: `/api/attachments/${image.id}`,
          headers: other,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/tccs/${work.id}`,
          headers: other,
          payload: { ...payload, intent: 'draft' },
        })
      ).statusCode,
    ).toBe(404);
    accessible = true;
    const published = await app.inject({
      method: 'PUT',
      url: `/api/tccs/${work.id}`,
      headers,
      payload: {
        ...payload,
        lumeUrl: 'https://lume.ufrgs.br/handle/10183/draft',
      },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().tcc.status).toBe('PUBLICADO');
    expect((await app.inject(`/api/attachments/${image.id}`)).statusCode).toBe(
      200,
    );
  } finally {
    await app.close();
  }
});

it('enforces mandatory fields, attachment cardinality, ownership and CSRF before durable writes', async () => {
  accessible = true;
  const app = await buildApp();
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          payload: body('Sem sessão'),
        })
      ).statusCode,
    ).toBe(401);
    const professor = await login(app, 'professor');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers: professor,
          payload: body('Professor'),
        })
      ).statusCode,
    ).toBe(403);
    const headers = await login(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers: { origin, cookie: headers.cookie },
          payload: body('Sem CSRF'),
        })
      ).statusCode,
    ).toBe(403);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/tccs',
      headers,
      payload: { intent: 'publish', title: '', tagIds: [] },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toBe(
      'Preencha todos os campos obrigatórios',
    );
    const foreign = await stageImage(fixtures.researcher.id);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers,
          payload: { ...body('Anexo estrangeiro'), mediaIds: [foreign.id] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers,
          payload: { ...body('Muitos anexos'), mediaIds: ['1', '2', '3', '4'] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tccs',
          headers,
          payload: {
            ...body('Não confiar em caminhos'),
            media: [{ url: '/secret' }],
          },
        })
      ).statusCode,
    ).toBe(400);
    const options = (await app.inject('/api/tcc-options')).json();
    expect(
      options.professors.some(
        (entry: { id: string }) => entry.id === fixtures.carlos.id,
      ),
    ).toBe(true);
    const tag = await app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: 'Nova tag M2' },
    });
    expect(tag.statusCode).toBe(201);
  } finally {
    await app.close();
  }
});

it('serializes concurrent retries of the same creation key without duplicate rows', async () => {
  accessible = true;
  const app = await buildApp();
  try {
    const headers = { ...(await login(app)), 'idempotency-key': randomUUID() };
    const payload = body('Requisição repetida em paralelo');
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/tccs', headers, payload }),
      app.inject({ method: 'POST', url: '/api/tccs', headers, payload }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([
      201, 201,
    ]);
    expect(responses[0]!.json().tcc.id).toBe(responses[1]!.json().tcc.id);
    const matching = (
      await app.inject('/api/tccs?term=Requisição%20repetida%20em%20paralelo')
    ).json();
    expect(matching.total).toBe(1);
  } finally {
    await app.close();
  }
});
