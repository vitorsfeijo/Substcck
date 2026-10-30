import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { relatedController } from './controllers/related.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { TccAccessError, type TccWriteInput } from './models/tcc.js';
import { createPlatformRepository } from './repositories/platform.js';
import { createRelatedRepository } from './repositories/related.js';
import { createTccRepository } from './repositories/tcc.js';
import { seedDevelopmentData } from './scripts/seed.js';

let db: Database;
let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
const config = readConfig({ NODE_ENV: 'test' });
beforeAll(async () => {
  db = await openDatabase({ dataDir: 'memory://' });
  await migrate(db);
});
beforeEach(async () => {
  await db.exec('DELETE FROM tccs');
  fixtures = await seedDevelopmentData(db, { environment: 'test' });
  await db.exec('DELETE FROM tccs');
});
afterAll(async () => db.close());

const works = () => createTccRepository(db);
const related = () => createRelatedRepository(db);
async function publish(
  title: string,
  tagIds: string[],
  overrides: Partial<TccWriteInput> = {},
) {
  return works().save(
    {
      title,
      summary: `Resumo público de ${title}.`,
      year: 2025,
      semester: 1,
      defendedAt: '2025-05-20',
      advisorId: fixtures.carlos.id,
      lumeUrl: 'https://lume.ufrgs.br/handle/10183/exemplo',
      status: 'PUBLICADO',
      tagIds,
      ...overrides,
    },
    fixtures.author.id,
  );
}
async function buildApp() {
  const app = await createApp(config, createPlatformRepository(db), {
    database: db,
  });
  if (!app.hasRoute({ method: 'GET', url: '/api/tccs/:id/related' }))
    relatedController(app, db);
  return app;
}

describe('classification-based related public works', () => {
  it('scores common tags and distinct areas, excludes self/drafts and retains the public DTO', async () => {
    const { redes, ia, seguranca } = fixtures.tags;
    const origin = await publish('Origem', [redes.id, ia.id, seguranca.id]);
    const strongest = await publish('Duas tags comuns', [redes.id, ia.id], {
      coadvisorId: fixtures.ana.id,
      collectionId: 'demo-collection-inf',
    });
    const recent = await publish('Uma tag recente', [redes.id], {
      defendedAt: '2025-05-25',
    });
    const older = await publish('Uma tag antiga', [seguranca.id], {
      year: 2024,
      semester: 2,
      defendedAt: '2024-11-01',
    });
    const other = await works().ensureTag(
      'Outra tag da mesma área',
      'demo-area-computing',
    );
    const areaOnly = await publish('Apenas área em comum', [other.id]);
    await publish('Sem classificação em comum', [
      (await works().ensureTag('Isolada')).id,
    ]);
    const draft = await publish('Rascunho secreto', [redes.id, ia.id], {
      status: 'RASCUNHO',
    });
    const result = await related().findRelated(origin.id);
    expect(result.items.map((item) => item.tcc.id)).toEqual([
      strongest.id,
      recent.id,
      older.id,
      areaOnly.id,
    ]);
    expect(result.items.map((item) => item.score)).toEqual([9, 5, 5, 1]);
    expect(result.items[0]!.sharedTags).toEqual(
      [ia, redes].map(({ id, name }) => ({ id, name })),
    );
    expect(result.items[0]!.sharedAreas).toEqual([
      { id: 'demo-area-computing', name: 'Computação (demonstração)' },
    ]);
    expect(result.items[0]!.tcc).toMatchObject({
      summary: strongest.summary,
      author: { id: fixtures.author.id },
      advisor: { id: fixtures.carlos.id },
      coadvisor: { id: fixtures.ana.id },
      collection: { id: 'demo-collection-inf' },
    });
    expect(JSON.stringify(result)).not.toContain(draft.id);
    expect(result.items.some((item) => item.tcc.id === origin.id)).toBe(false);
  });

  it('counts separate shared areas once each even when several tags use the same area', async () => {
    const secondArea = randomUUID();
    await db.query('INSERT INTO areas(id, name) VALUES ($1, $2)', [
      secondArea,
      `Área ${secondArea}`,
    ]);
    const secondTag = await works().ensureTag(
      `Outra ${secondArea}`,
      secondArea,
    );
    const origin = await publish('Origem com duas áreas', [
      fixtures.tags.redes.id,
      fixtures.tags.ia.id,
      secondTag.id,
    ]);
    const candidate = await publish('Candidato com duas áreas', [
      fixtures.tags.redes.id,
      fixtures.tags.ia.id,
      secondTag.id,
    ]);
    const result = await related().findRelated(origin.id);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.tcc.id).toBe(candidate.id);
    expect(result.items[0]!.score).toBe(14);
    expect(result.items[0]!.sharedAreas).toHaveLength(2);
  });

  it('limits to four and resolves equal scores by defense, publication then ID without using views or author', async () => {
    const tagId = fixtures.tags.redes.id;
    const origin = await publish('Origem limite', [tagId]);
    const candidates = await Promise.all(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((title) => publish(title, [tagId])),
    );
    for (const [position, item] of candidates.entries())
      await db.query(
        'UPDATE tccs SET defended_at = $2, published_at = $3, views = $4 WHERE id = $1',
        [
          item.id,
          position === 0 ? '2025-05-22' : '2025-05-20',
          position === 1 ? '2025-06-03T00:00:00Z' : '2025-06-01T00:00:00Z',
          position === 5 ? 99999 : 0,
        ],
      );
    const expected = [
      candidates[0]!.id,
      candidates[1]!.id,
      ...candidates
        .slice(2)
        .map((item) => item.id)
        .sort(),
    ].slice(0, 4);
    expect(
      (await related().findRelated(origin.id)).items.map((item) => item.tcc.id),
    ).toEqual(expected);
    expect(
      (await related().findRelated(origin.id)).items.map((item) => item.tcc.id),
    ).toEqual(expected);
  });

  it('returns an empty list without inventing a relationship for unrelated or unclassified works', async () => {
    const origin = await publish('Apenas Redes', [fixtures.tags.redes.id]);
    await publish('Sem relação', [
      (await works().ensureTag('Tema sem área')).id,
    ]);
    await works().save(
      { title: 'Rascunho sem tags', status: 'RASCUNHO' },
      fixtures.author.id,
    );
    expect(await related().findRelated(origin.id)).toEqual({ items: [] });
  });

  it('reflects edited classification immediately and never falls back to matching names or authors', async () => {
    const origin = await publish('Mesmo nome', [fixtures.tags.redes.id]);
    const candidate = await publish('Mesmo nome', [fixtures.tags.ia.id]);
    expect((await related().findRelated(origin.id)).items[0]!.score).toBe(1);
    const detached = await works().ensureTag('Assunto agora isolado');
    await publish(candidate.title, [detached.id], { id: candidate.id });
    expect(await related().findRelated(origin.id)).toEqual({ items: [] });
    await publish(candidate.title, [fixtures.tags.redes.id], {
      id: candidate.id,
    });
    expect((await related().findRelated(origin.id)).items[0]!.score).toBe(5);
  });

  it('rejects missing and private origin IDs and exposes only public related results without login', async () => {
    const origin = await publish('Origem HTTP', [fixtures.tags.redes.id]);
    const candidate = await publish('Candidato HTTP', [fixtures.tags.redes.id]);
    const draft = await publish('Origem privada', [fixtures.tags.redes.id], {
      status: 'RASCUNHO',
    });
    await expect(related().findRelated(draft.id)).rejects.toBeInstanceOf(
      TccAccessError,
    );
    await expect(related().findRelated('ausente')).rejects.toBeInstanceOf(
      TccAccessError,
    );
    const app = await buildApp();
    try {
      for (const id of ['ausente', draft.id]) {
        const response = await app.inject(`/api/tccs/${id}/related`);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          code: 'NOT_FOUND',
          message: 'Trabalho não encontrado.',
        });
        expect(response.body).not.toContain('Origem privada');
      }
      const response = await app.inject(`/api/tccs/${origin.id}/related`);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(
        response
          .json()
          .items.map((item: { tcc: { id: string } }) => item.tcc.id),
      ).toEqual([candidate.id]);
    } finally {
      await app.close();
    }
  });
});
