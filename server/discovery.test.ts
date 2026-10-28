import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { createPlatformRepository } from './repositories/platform.js';
import { createTccRepository } from './repositories/tcc.js';
import { createDiscoveryRepository } from './repositories/discovery.js';
import { seedDevelopmentData } from './scripts/seed.js';
import { digestToken } from './repositories/sessions.js';
import { TccAccessError } from './models/tcc.js';

const config = readConfig({ NODE_ENV: 'test' });
const origin = config.corsOrigins[0]!;
const now = new Date('2026-10-28T12:00:00Z');
let db: Database;
let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
});
beforeEach(async () => {
  await db.exec('DELETE FROM tccs');
  fixtures = await seedDevelopmentData(db, { environment: 'test' });
});
afterAll(async () => {
  await db.close();
});

async function buildApp(serverConfig = config) {
  return createApp(serverConfig, createPlatformRepository(db), {
    database: db,
  });
}

const discovery = () => createDiscoveryRepository(db);
const works = () => createTccRepository(db);
const session = (key: string) => digestToken(key);
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('public discovery and reading', () => {
  it('returns complete public detail and excludes a known draft from detail, recency and filter options', async () => {
    const a = fixtures.works.A!;
    await works().save(
      {
        ...a,
        advisorId: fixtures.carlos.id,
        coadvisorId: fixtures.ana.id,
        tagIds: [fixtures.tags.redes.id],
        collectionId: 'demo-collection-inf',
        media: [
          {
            id: 'detail-image',
            url: '/api/attachments/detail-image',
            description: 'Descrição acessível',
          },
        ],
        file: {
          id: 'detail-file',
          originalName: 'artigo.pdf',
          format: 'PDF',
          path: '/api/attachments/detail-file',
        },
      },
      fixtures.author.id,
    );
    const draftTag = await works().ensureTag('Assunto apenas privado');
    await works().save(
      {
        title: 'Rascunho sigiloso',
        status: 'RASCUNHO',
        tagIds: [draftTag.id],
      },
      fixtures.researcher.id,
    );
    const app = await buildApp();
    try {
      const detail = await app.inject(`/api/tccs/${a.id}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        author: { id: fixtures.author.id },
        advisor: { id: fixtures.carlos.id },
        coadvisor: { id: fixtures.ana.id },
        collection: { id: 'demo-collection-inf' },
        year: 2025,
        semester: 1,
        defendedAt: '2025-05-20',
        summary: a.summary,
        lumeUrl: a.lumeUrl,
        tags: [{ id: fixtures.tags.redes.id }],
        media: [{ id: 'detail-image', description: 'Descrição acessível' }],
        file: { originalName: 'artigo.pdf', format: 'PDF' },
      });
      expect(
        (await app.inject(`/api/tccs/${fixtures.works.E!.id}`)).statusCode,
      ).toBe(404);
      const feed = (await app.inject('/api/feed')).json();
      expect(ids(feed.recent)).toEqual(
        ['D', 'B', 'A', 'C'].map((key) => fixtures.works[key]!.id),
      );
      expect(feed).toMatchObject({ topics: [], windowDays: 30 });
      const options = (await app.inject('/api/discovery-options')).json();
      expect(options.authors).toEqual([
        { id: fixtures.author.id, name: fixtures.author.name },
      ]);
      expect(ids(options.advisors)).toEqual(
        expect.arrayContaining([fixtures.carlos.id, fixtures.ana.id]),
      );
      expect(options.years).toEqual([2025, 2024]);
      expect(ids(options.tags)).not.toContain(draftTag.id);
      expect(ids(options.tags)).not.toContain(fixtures.tags.seguranca.id);
      expect(options).not.toHaveProperty('emails');
    } finally {
      await app.close();
    }
  });

  it('reproduces CT03 A-E, literal text normalization and independently intersected filters', async () => {
    const app = await buildApp();
    try {
      const query = new URLSearchParams({
        year: '2025',
        advisorId: fixtures.carlos.id,
        tagIds: fixtures.tags.redes.id,
      });
      const matched = (await app.inject(`/api/tccs?${query}`)).json();
      expect(ids(matched.items)).toEqual([fixtures.works.A!.id]);
      expect(matched.total).toBe(1);
      expect(
        (
          await app.inject(
            `/api/tccs?year=2023&tagIds=${fixtures.tags.redes.id}`,
          )
        ).json(),
      ).toMatchObject({ items: [], total: 0 });
      for (const term of [
        'DEMONSTRACAO A',
        'carlos lima',
        fixtures.author.name.toUpperCase(),
      ]) {
        const result = (
          await app.inject(`/api/tccs?term=${encodeURIComponent(term)}`)
        ).json();
        expect(ids(result.items)).toContain(fixtures.works.A!.id);
        expect(ids(result.items)).not.toContain(fixtures.works.E!.id);
      }
      expect(
        (await app.inject(`/api/tccs?authorId=${fixtures.carlos.id}`)).json()
          .items,
      ).toEqual([]);
      expect((await app.inject('/api/tccs?term=%25')).json().items).toEqual([]);
      const date = (
        await app.inject(
          `/api/tccs?dateFrom=2025-05-20&dateTo=2025-05-21&semester=1&authorId=${fixtures.author.id}&advisorId=${fixtures.carlos.id}`,
        )
      ).json();
      expect(ids(date.items)).toEqual([
        fixtures.works.B!.id,
        fixtures.works.A!.id,
      ]);
      expect(
        (await app.inject('/api/tccs?dateFrom=2025-05-23&dateTo=2025-05-20'))
          .statusCode,
      ).toBe(400);
      expect((await app.inject('/api/tccs?pageSize=101')).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('applies AND tags, OR areas, collection intersection and stable pagination', async () => {
    await db.query('INSERT INTO areas (id, name) VALUES ($1, $2)', [
      'extra-area',
      'Engenharia adicional',
    ]);
    await db.query('INSERT INTO collections (id, name) VALUES ($1, $2)', [
      'extra-collection',
      'Coleção adicional',
    ]);
    const extra = await works().ensureTag('Controle adicional', 'extra-area');
    const a = fixtures.works.A!;
    await works().save(
      {
        ...a,
        advisorId: fixtures.carlos.id,
        tagIds: [fixtures.tags.redes.id, extra.id],
        collectionId: 'extra-collection',
      },
      fixtures.author.id,
    );
    expect(
      ids(
        (
          await works().listPublic({
            tagIds: [extra.id, fixtures.tags.redes.id],
          })
        ).items,
      ),
    ).toEqual([a.id]);
    expect(
      (
        await works().listPublic({
          tagIds: [fixtures.tags.ia.id, fixtures.tags.redes.id],
        })
      ).items,
    ).toEqual([]);
    const eitherArea = await works().listPublic({
      areaIds: ['extra-area', 'demo-area-computing'],
    });
    expect(eitherArea.total).toBe(4);
    expect(
      ids(
        (
          await works().listPublic({
            areaIds: ['extra-area'],
            collectionId: 'extra-collection',
            year: 2025,
          })
        ).items,
      ),
    ).toEqual([a.id]);
    expect(
      (
        await works().listPublic({
          areaIds: ['extra-area'],
          collectionId: 'demo-collection-inf',
        })
      ).items,
    ).toEqual([]);
    const first = await works().listPublic({ page: 1, pageSize: 2 });
    const second = await works().listPublic({ page: 2, pageSize: 2 });
    expect(ids([...first.items, ...second.items])).toEqual(
      ['D', 'B', 'A', 'C'].map((key) => fixtures.works[key]!.id),
    );
    expect(first.total).toBe(4);
    expect((await works().listPublic({ page: 3, pageSize: 2 })).items).toEqual(
      [],
    );
  });

  it('limits feed lists and orders tied defenses by publication time then ID', async () => {
    const base = fixtures.works.A!;
    const created = [];
    for (let index = 0; index < 10; index++) {
      const work = await works().save(
        {
          title: `Recente ${index}`,
          summary: 'Resumo acessível',
          year: 2025,
          semester: 2,
          defendedAt: '2025-10-01',
          advisorId: fixtures.carlos.id,
          lumeUrl: base.lumeUrl,
          status: 'PUBLICADO',
          tagIds: [fixtures.tags.redes.id],
        },
        fixtures.author.id,
      );
      created.push(work.id);
    }
    await db.query(
      'UPDATE tccs SET published_at = $1 WHERE id = ANY($2::text[])',
      ['2025-10-02T12:00:00Z', created],
    );
    const newest = [...created].sort().slice(0, 8);
    expect(ids((await discovery().feed(now)).recent)).toEqual(newest);
    await db.query('UPDATE tccs SET published_at = $1 WHERE id = $2', [
      '2025-10-03T12:00:00Z',
      created[9],
    ]);
    expect((await discovery().feed(now)).recent[0]!.id).toBe(created[9]);
  });
});

describe('anonymous exploration metrics', () => {
  it('establishes the visitor cookie on direct detail before concurrent view POSTs', async () => {
    const app = await buildApp();
    try {
      const url = `/api/tccs/${fixtures.works.A!.id}`;
      expect(
        (await app.inject('/api/feed')).headers['set-cookie'],
      ).toBeUndefined();
      expect(
        (await app.inject('/api/discovery-options')).headers['set-cookie'],
      ).toBeUndefined();
      expect(
        (await app.inject('/api/auth/config')).headers['set-cookie'],
      ).toBeUndefined();
      const first = await app.inject(url);
      expect(first.statusCode).toBe(200);
      expect(first.headers['cache-control']).toBe('private, no-store');
      const cookie = String(first.headers['set-cookie']).split(';')[0]!;
      expect(cookie).toMatch(/^substcck_visitor=[A-Za-z0-9_-]{43}$/);
      const detailAgain = await app.inject({ url, headers: { cookie } });
      expect(detailAgain.headers['set-cookie']).toBeUndefined();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          app.inject({
            method: 'POST',
            url: `${url}/views`,
            payload: {},
            headers: { origin, cookie },
          }),
        ),
      );
      expect(results.filter((result) => result.json().counted)).toHaveLength(1);
      expect((await works().findPublicById(fixtures.works.A!.id))!.views).toBe(
        1,
      );
    } finally {
      await app.close();
    }
  });

  it('deduplicates concurrent reads per session/work for a rolling30 minutes and preserves total views', async () => {
    const id = fixtures.works.A!.id;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        discovery().recordView(id, session('one-session'), now),
      ),
    );
    expect(results.filter((result) => result.counted)).toHaveLength(1);
    expect(
      await discovery().recordView(
        id,
        session('one-session'),
        new Date(now.getTime() + 29 * 60_000),
      ),
    ).toEqual({ counted: false });
    expect(
      await discovery().recordView(
        id,
        session('one-session'),
        new Date(now.getTime() + 30 * 60_000),
      ),
    ).toEqual({ counted: true });
    expect(
      await discovery().recordView(id, session('another-session'), now),
    ).toEqual({ counted: true });
    expect((await works().findPublicById(id))!.views).toBe(3);
    expect(
      (await db.query('SELECT id FROM tcc_view_events WHERE tcc_id=$1', [id]))
        .rows,
    ).toHaveLength(3);
    await expect(
      discovery().recordView(fixtures.works.E!.id, session('draft'), now),
    ).rejects.toBeInstanceOf(TccAccessError);
    await expect(
      discovery().recordView('missing', session('missing'), now),
    ).rejects.toBeInstanceOf(TccAccessError);
  });

  it('ranks only events in the30-day window, excludes drafts and keeps tag snapshots after edits', async () => {
    const a = fixtures.works.A!;
    await discovery().recordView(a.id, session('current-a'), now);
    await discovery().recordView(
      fixtures.works.B!.id,
      session('current-b'),
      now,
    );
    await discovery().recordView(
      fixtures.works.C!.id,
      session('old'),
      new Date(now.getTime() - 31 * 86_400_000),
    );
    await discovery().recordView(
      fixtures.works.C!.id,
      session('future'),
      new Date(now.getTime() + 1),
    );
    await db.query('UPDATE tccs SET views=999 WHERE id=$1', [
      fixtures.works.D!.id,
    ]);
    const draftEvent = randomUUID();
    await db.query(
      'INSERT INTO tcc_view_events (id,tcc_id,occurred_at) VALUES ($1,$2,$3)',
      [draftEvent, fixtures.works.E!.id, now.toISOString()],
    );
    await db.query(
      'INSERT INTO tcc_view_event_tags (event_id,tag_id) VALUES ($1,$2)',
      [draftEvent, fixtures.tags.redes.id],
    );
    let feed = await discovery().feed(now);
    expect(feed.topics.map((topic) => [topic.name, topic.views])).toEqual([
      ['IA', 1],
      ['Redes', 1],
    ]);
    await works().save(
      { ...a, advisorId: fixtures.carlos.id, tagIds: [fixtures.tags.ia.id] },
      fixtures.author.id,
    );
    feed = await discovery().feed(now);
    expect(feed.topics.map((topic) => [topic.name, topic.views])).toEqual([
      ['IA', 1],
      ['Redes', 1],
    ]);
    await discovery().recordView(a.id, session('post-edit'), now);
    expect(
      (await discovery().feed(now)).topics.map((topic) => [
        topic.name,
        topic.views,
      ]),
    ).toEqual([
      ['IA', 2],
      ['Redes', 1],
    ]);
  });

  it('rolls back deduplication, total and event when event-tag persistence fails', async () => {
    const failing: Database = {
      ...db,
      transaction: (work) =>
        db.transaction((tx) =>
          work({
            ...tx,
            query: (sql, params) => {
              if (sql.startsWith('INSERT INTO tcc_view_event_tags'))
                throw new Error('Controlled write failure');
              return tx.query(sql, params);
            },
          }),
        ),
    };
    const id = fixtures.works.A!.id;
    await expect(
      createDiscoveryRepository(failing).recordView(
        id,
        session('retryable'),
        now,
      ),
    ).rejects.toThrow('Controlled write failure');
    expect((await works().findPublicById(id))!.views).toBe(0);
    expect((await db.query('SELECT id FROM tcc_view_events')).rows).toEqual([]);
    expect(
      (await db.query('SELECT tcc_id FROM tcc_view_sessions')).rows,
    ).toEqual([]);
    expect(await discovery().recordView(id, session('retryable'), now)).toEqual(
      { counted: true },
    );
  });

  it('guards origin and draft IDs and uses an opaque HttpOnly session cookie with secure production attributes', async () => {
    const app = await buildApp();
    try {
      for (const headers of [{}, { origin: 'https://attacker.invalid' }])
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/tccs/${fixtures.works.A!.id}/views`,
              payload: {},
              headers,
            })
          ).statusCode,
        ).toBe(403);
      const draft = await app.inject({
        method: 'POST',
        url: `/api/tccs/${fixtures.works.E!.id}/views`,
        payload: {},
        headers: { origin },
      });
      expect(draft.statusCode).toBe(404);
      expect(draft.headers['set-cookie']).toBeUndefined();
      const first = await app.inject({
        method: 'POST',
        url: `/api/tccs/${fixtures.works.A!.id}/views`,
        payload: {},
        headers: { origin },
      });
      expect(first.json()).toEqual({ counted: true });
      const cookie = String(first.headers['set-cookie']);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Max-Age');
      const token = cookie.split(';')[0]!.split('=')[1]!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = (
        await db.query<{ session_hash: string }>(
          'SELECT session_hash FROM tcc_view_sessions',
        )
      ).rows[0]!.session_hash;
      expect(stored).toBe(digestToken(token));
      expect(stored).not.toBe(token);
      const repeated = await app.inject({
        method: 'POST',
        url: `/api/tccs/${fixtures.works.A!.id}/views`,
        payload: {},
        headers: { origin, cookie: cookie.split(';')[0] },
      });
      expect(repeated.json()).toEqual({ counted: false });
      expect(repeated.headers['set-cookie']).toBeUndefined();
    } finally {
      await app.close();
    }
    const production = await buildApp({ ...config, environment: 'production' });
    try {
      const response = await production.inject({
        method: 'POST',
        url: `/api/tccs/${fixtures.works.A!.id}/views`,
        payload: {},
        headers: { origin },
      });
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toMatch(/^__Host-substcck_visitor=/);
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Path=/');
    } finally {
      await production.close();
    }
  });
});
