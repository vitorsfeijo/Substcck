import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { createPlatformRepository } from './repositories/platform.js';
import { seedDevelopmentData } from './scripts/seed.js';

let db: Database;
let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
const origin = 'http://127.0.0.1:5173';
beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
  fixtures = await seedDevelopmentData(db, { environment: 'test' });
});
afterAll(async () => {
  await db.close();
});

it('keeps drafts private through every HTTP lookup and prevents cross-author access', async () => {
  const app = await createApp(
    readConfig({ NODE_ENV: 'test', AUTH_MODE: 'development' }),
    createPlatformRepository(db),
    { database: db },
  );
  const login = async (persona: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/development',
      headers: { origin },
      payload: { persona },
    });
    expect(response.statusCode).toBe(200);
    return String(response.headers['set-cookie']).split(';')[0];
  };
  try {
    const publicPage = (await app.inject('/api/tccs')).json();
    expect(publicPage.total).toBe(4);
    expect(
      publicPage.items.every(
        (work: { status: string }) => work.status === 'PUBLICADO',
      ),
    ).toBe(true);
    expect(Object.keys(publicPage.items[0].author).sort()).toEqual([
      'id',
      'name',
    ]);
    const draftId = fixtures.works.E!.id;
    expect((await app.inject(`/api/tccs/${draftId}`)).statusCode).toBe(404);
    expect((await app.inject(`/api/me/tccs/${draftId}`)).statusCode).toBe(401);
    const otherCookie = await login('researcher');
    expect(
      (
        await app.inject({
          url: `/api/me/tccs/${draftId}`,
          headers: { cookie: otherCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: '/api/me/tccs',
          headers: { cookie: otherCookie },
        })
      ).json().total,
    ).toBe(0);
    const ownerCookie = await login('author');
    expect(
      (
        await app.inject({
          url: '/api/me/tccs',
          headers: { cookie: ownerCookie },
        })
      ).json().total,
    ).toBe(5);
    expect(
      (
        await app.inject({
          url: `/api/me/tccs/${draftId}`,
          headers: { cookie: ownerCookie },
        })
      ).json().status,
    ).toBe('RASCUNHO');
    expect(
      (
        await app.inject({
          url: `/api/tccs/${draftId}`,
          headers: { cookie: ownerCookie },
        })
      ).statusCode,
    ).toBe(404);
    const professorCookie = await login('professor');
    expect(
      (
        await app.inject({
          url: `/api/me/tccs/${draftId}`,
          headers: { cookie: professorCookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject(
          `/api/tccs?year=2025&advisorId=${fixtures.carlos.id}&tagIds=${fixtures.tags.redes.id}`,
        )
      )
        .json()
        .items.map((work: { id: string }) => work.id),
    ).toEqual([fixtures.works.A!.id]);
    expect((await app.inject('/api/tccs?status=RASCUNHO')).statusCode).toBe(
      400,
    );
    expect((await app.inject('/api/tccs?year=invalid')).statusCode).toBe(400);
    expect(
      (await app.inject('/api/tccs?authorId=%27%20OR%201%3D1--')).json().total,
    ).toBe(0);
  } finally {
    await app.close();
  }
});
