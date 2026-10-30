import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { createPlatformRepository } from './repositories/platform.js';
import { createTccRepository } from './repositories/tcc.js';
import { seedDevelopmentData } from './scripts/seed.js';
import { createSemanticSearchService } from './services/semantic-search.js';
import {
  semanticEvaluationCorpus,
  semanticEvaluationQueries,
} from './semantic/evaluation.js';
import type { TccDTO } from './models/tcc.js';
import {
  ensureSemanticDocuments,
  rebuildSemanticDocuments,
  updateSemanticDocument,
} from './semantic/documents.js';

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

async function evaluationCorpus() {
  await db.exec('DELETE FROM tccs');
  await db.query(
    "INSERT INTO areas (id, name) VALUES ('semantic-health', 'Clínica') ON CONFLICT DO NOTHING",
  );
  await db.query(
    "INSERT INTO collections (id, name) VALUES ('semantic-health', 'Hospitais') ON CONFLICT DO NOTHING",
  );
  const repository = createTccRepository(db);
  const tags = {
    saude: await repository.ensureTag('Sigilo', 'semantic-health'),
    redes: await repository.ensureTag('Veicular'),
    agro: await repository.ensureTag('Agrícola'),
  };
  const items = new Map<string, TccDTO>();
  for (const source of semanticEvaluationCorpus) {
    const group = source.id.split('-')[0] as keyof typeof tags;
    const work = await repository.save(
      {
        title: source.title,
        summary: source.summary,
        year: 2025,
        semester: 2,
        defendedAt: '2025-10-15',
        advisorId: fixtures.carlos.id,
        lumeUrl: 'https://lume.ufrgs.br/handle/10183/evaluation',
        status: 'PUBLICADO',
        tagIds: [tags[group].id],
        collectionId: group === 'saude' ? 'semantic-health' : null,
      },
      fixtures.author.id,
    );
    items.set(source.id, work);
  }
  return { items, tags, repository };
}

it('retrieves the three meaning targets without literal overlap through the real SQL corpus', async () => {
  const corpus = await evaluationCorpus();
  const service = createSemanticSearchService(db);
  for (const evaluation of semanticEvaluationQueries) {
    const target = corpus.items.get(evaluation.expectedId)!;
    const textual = await corpus.repository.listPublic({
      term: evaluation.query,
    });
    expect(textual.items.some((item) => item.id === target.id)).toBe(false);
    const semantic = await service.search({ term: evaluation.query });
    expect(semantic.search.mode).toBe('semantic');
    expect(
      semantic.items.slice(0, 3).some((item) => item.id === target.id),
    ).toBe(true);
    const relevant = [...corpus.items]
      .filter(([key]) => key.startsWith(evaluation.group))
      .map(([, item]) => item.id);
    expect(
      semantic.items.slice(0, 3).every((item) => relevant.includes(item.id)),
    ).toBe(true);
  }
});

it('keeps every structural restriction and paginates only the eligible semantic results', async () => {
  const corpus = await evaluationCorpus();
  const service = createSemanticSearchService(db);
  const exact = corpus.items.get('saude-criptografia')!;
  const extra = await corpus.repository.ensureTag('Anonimização');
  await corpus.repository.save(
    {
      ...exact,
      advisorId: fixtures.carlos.id,
      tagIds: [corpus.tags.saude.id, extra.id],
      collectionId: 'semantic-health',
    },
    fixtures.author.id,
  );
  const result = await service.search({
    term: 'proteção privacidade',
    year: 2025,
    semester: 2,
    dateFrom: '2025-10-01',
    dateTo: '2025-10-31',
    authorId: fixtures.author.id,
    advisorId: fixtures.carlos.id,
    collectionId: 'semantic-health',
    tagIds: [corpus.tags.saude.id, extra.id],
    areaIds: ['semantic-health'],
  });
  expect(result.search.mode).toBe('semantic');
  expect(result.items.map((item) => item.id)).toEqual([exact.id]);
  expect(
    (
      await service.search({
        term: 'proteção privacidade',
        advisorId: fixtures.ana.id,
      })
    ).items,
  ).toEqual([]);
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      service.search({ term: 'proteção privacidade', page, pageSize: 1 }),
    ),
  );
  expect(
    pages.every((page) => page.total === 3 && page.search.mode === 'semantic'),
  ).toBe(true);
  expect(
    new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size,
  ).toBe(3);
});

it('invalidates the cached representation after edits and never learns from a private work', async () => {
  const corpus = await evaluationCorpus();
  const service = createSemanticSearchService(db);
  const target = corpus.items.get('saude-criptografia')!;
  expect(
    (await service.search({ term: 'proteção privacidade' })).items.some(
      (item) => item.id === target.id,
    ),
  ).toBe(true);
  const draft = await corpus.repository.save(
    {
      title: 'Segredo de proteção e privacidade',
      summary: 'Anonimização e sigilo hospitalar.',
      status: 'RASCUNHO',
      tagIds: [corpus.tags.saude.id],
    },
    fixtures.researcher.id,
  );
  expect(
    (await service.search({ term: 'proteção privacidade' })).items.some(
      (item) => item.id === draft.id,
    ),
  ).toBe(false);
  const code = await corpus.repository.ensureTag('Compiladores');
  await corpus.repository.save(
    {
      ...target,
      title: 'Compiladores e análise sintática',
      summary: 'Gramáticas e tradução de programas.',
      advisorId: fixtures.carlos.id,
      tagIds: [code.id],
      collectionId: null,
    },
    fixtures.author.id,
  );
  const after = await service.search({ term: 'proteção privacidade' });
  expect(after.search.mode).toBe('semantic');
  expect(
    after.items.some((item) => item.id === target.id || item.id === draft.id),
  ).toBe(false);
  await db.query("UPDATE tccs SET status = 'RASCUNHO' WHERE id = $1", [
    corpus.items.get('saude-protecao')!.id,
  ]);
  expect(
    (await service.search({ term: 'proteção privacidade' })).items.some(
      (item) => item.id === corpus.items.get('saude-protecao')!.id,
    ),
  ).toBe(false);
});

it('indexes only published content atomically and preserves PostgreSQL timestamp precision', async () => {
  const before = await db.query<{ tcc_id: string; source_hash: string }>(
    'SELECT tcc_id, source_hash FROM semantic_documents ORDER BY tcc_id',
  );
  expect(before.rows).toHaveLength(4);
  expect(before.rows.some((row) => row.tcc_id === fixtures.works.E!.id)).toBe(
    false,
  );
  const work = fixtures.works.A!;
  await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE tccs SET updated_at = '2026-10-30T12:00:00.123456Z' WHERE id = $1",
      [work.id],
    );
    await updateSemanticDocument(tx, work.id);
  });
  const precision = await db.query<{ same: boolean }>(
    'SELECT d.source_updated_at = t.updated_at AS same FROM tccs t JOIN semantic_documents d ON d.tcc_id = t.id WHERE t.id = $1',
    [work.id],
  );
  expect(precision.rows[0]!.same).toBe(true);
  await createTccRepository(db).save(
    {
      ...work,
      summary: 'Criptografia e privacidade para dados pessoais.',
      advisorId: work.advisor!.id,
      tagIds: [fixtures.tags.ia.id],
    },
    fixtures.author.id,
  );
  const after = await db.query<{
    source_hash: string;
    terms: Record<string, number>;
  }>('SELECT source_hash, terms FROM semantic_documents WHERE tcc_id = $1', [
    work.id,
  ]);
  expect(after.rows[0]!.source_hash).not.toBe(
    before.rows.find((row) => row.tcc_id === work.id)!.source_hash,
  );
  expect(after.rows[0]!.terms.criptografia).toBeGreaterThan(0);
});

it('rebuilds missing or outdated representations and removes private or deleted work', async () => {
  await db.query('DELETE FROM semantic_documents WHERE tcc_id = $1', [
    fixtures.works.A!.id,
  ]);
  await db.query("UPDATE semantic_documents SET version = 'outdated'");
  expect(await ensureSemanticDocuments(db)).toBe(4);
  expect(await ensureSemanticDocuments(db)).toBe(0);
  await db.query("UPDATE tccs SET status = 'RASCUNHO' WHERE id = $1", [
    fixtures.works.B!.id,
  ]);
  expect(await rebuildSemanticDocuments(db)).toBe(3);
  expect(
    (
      await db.query(
        'SELECT tcc_id FROM semantic_documents WHERE tcc_id = $1',
        [fixtures.works.B!.id],
      )
    ).rows,
  ).toHaveLength(0);
  await db.query('DELETE FROM tccs WHERE id = $1', [fixtures.works.A!.id]);
  expect(
    (
      await db.query(
        'SELECT tcc_id FROM semantic_documents WHERE tcc_id = $1',
        [fixtures.works.A!.id],
      )
    ).rows,
  ).toHaveLength(0);
});

it('rolls back publication changes when the semantic representation cannot be written', async () => {
  const work = fixtures.works.A!;
  const failing: Database = {
    ...db,
    transaction: (operation) =>
      db.transaction((tx) =>
        operation({
          ...tx,
          query: (sql, params) => {
            if (sql.includes('INSERT INTO semantic_documents'))
              throw new Error('Controlled index failure');
            return tx.query(sql, params);
          },
        }),
      ),
  };
  await expect(
    createTccRepository(failing).save(
      {
        ...work,
        title: 'Revisão que deve falhar',
        advisorId: work.advisor!.id,
        tagIds: [fixtures.tags.ia.id],
      },
      fixtures.author.id,
    ),
  ).rejects.toThrow('Controlled index failure');
  const preserved = await createTccRepository(db).findPublicById(work.id);
  expect(preserved!.title).toBe(work.title);
  expect(preserved!.tags.map((tag) => tag.id)).toEqual([
    fixtures.tags.redes.id,
  ]);
  expect(await rebuildSemanticDocuments(db)).toBe(4);
});

it('falls back explicitly with identical structured filters when the index is unavailable', async () => {
  await db.query('DELETE FROM semantic_documents WHERE tcc_id = $1', [
    fixtures.works.A!.id,
  ]);
  const result = await createSemanticSearchService(db).search({
    term: 'demonstracao',
    year: 2025,
    advisorId: fixtures.carlos.id,
    tagIds: [fixtures.tags.redes.id],
  });
  expect(result.items.map((work) => work.id)).toEqual([fixtures.works.A!.id]);
  expect(result.search).toMatchObject({
    requestedMode: 'semantic',
    mode: 'text',
    fallbackReason: 'index_unavailable',
  });
  expect(result.search.notice).toContain('Exibindo resultados por texto.');
});

it('preserves the complete prior representation when a rebuild fails halfway', async () => {
  const before = await db.query(
    'SELECT tcc_id, source_hash, terms, version FROM semantic_documents ORDER BY tcc_id',
  );
  let writes = 0;
  const failing: Database = {
    ...db,
    transaction: (operation) =>
      db.transaction((tx) =>
        operation({
          ...tx,
          query: (sql, params) => {
            if (
              sql.includes('INSERT INTO semantic_documents') &&
              ++writes === 2
            )
              throw new Error('Controlled rebuild failure');
            return tx.query(sql, params);
          },
        }),
      ),
  };
  await expect(rebuildSemanticDocuments(failing)).rejects.toThrow(
    'Controlled rebuild failure',
  );
  expect(
    (
      await db.query(
        'SELECT tcc_id, source_hash, terms, version FROM semantic_documents ORDER BY tcc_id',
      )
    ).rows,
  ).toEqual(before.rows);
});

it('rejects unsupported mode and invalid filters before a public semantic request is executed', async () => {
  const app = await createApp(
    readConfig({ NODE_ENV: 'test' }),
    createPlatformRepository(db),
    { database: db },
  );
  try {
    for (const query of [
      'mode=unknown',
      'mode=semantic&page=-1',
      'mode=semantic&unexpected=value',
      'mode=semantic&year=2025&year=2024',
    ]) {
      expect((await app.inject(`/api/search?${query}`)).statusCode).toBe(400);
    }
    expect(
      (
        await app.inject(
          '/api/search?mode=semantic&term=demonstracao&year=2023&tagIds=' +
            fixtures.tags.redes.id,
        )
      ).json().items,
    ).toEqual([]);
  } finally {
    await app.close();
  }
});
