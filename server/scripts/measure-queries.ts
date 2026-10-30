import { performance } from 'node:perf_hooks';
import {
  openDatabase,
  type Database,
  type SqlConnection,
} from '../data/database.js';
import { migrate } from '../data/migrate.js';
import { createTccRepository } from '../repositories/tcc.js';
import { createDiscoveryRepository } from '../repositories/discovery.js';
import { createRelatedRepository } from '../repositories/related.js';
import { createSemanticSearchService } from '../services/semantic-search.js';
import { rebuildSemanticDocuments } from '../semantic/documents.js';
import { semanticEvaluationCorpus } from '../semantic/evaluation.js';
import { seedDevelopmentData } from './seed.js';

// Deliberately ignores DATABASE_URL, .env and disk paths. Nothing touches a real acervo.
const db = await openDatabase({ dataDir: 'memory://' });
const samples = 5;
const publicCopies = 180;
const privateCopies = 20;
const captured: { sql: string; params?: unknown[] }[] = [];
function traced(connection: SqlConnection): SqlConnection {
  return {
    async query(sql, params) {
      captured.push({ sql, params });
      return connection.query(sql, params);
    },
    exec: (sql) => connection.exec(sql),
  };
}
const observed: Database = {
  ...traced(db),
  transaction: (work) => db.transaction((tx) => work(traced(tx))),
  close: async () => {},
};

try {
  await migrate(db);
  const fixtures = await seedDevelopmentData(db, { environment: 'test' });
  const tagIds = [
    fixtures.tags.redes.id,
    fixtures.tags.ia.id,
    fixtures.tags.seguranca.id,
  ];
  await db.transaction(async (tx) => {
    for (let index = 0; index < publicCopies + privateCopies; index++) {
      const source =
        semanticEvaluationCorpus[index % semanticEvaluationCorpus.length]!;
      await tx.query(
        `INSERT INTO tccs (id, title, summary, year, semester, defended_at, author_id, advisor_id, lume_url, status, collection_id, published_at)
        VALUES ($1,$2,$3,2025,1,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)`,
        [
          `measure-${String(index).padStart(4, '0')}`,
          `${source.title} — amostra ${index}`,
          source.summary,
          `2025-05-${String(1 + (index % 28)).padStart(2, '0')}`,
          fixtures.author.id,
          index % 2 ? fixtures.carlos.id : fixtures.ana.id,
          `https://lume.ufrgs.br/handle/10183/measure-${index}`,
          index < publicCopies ? 'PUBLICADO' : 'RASCUNHO',
          'demo-collection-inf',
        ],
      );
      await tx.query('INSERT INTO tcc_tags (tcc_id, tag_id) VALUES ($1,$2)', [
        `measure-${String(index).padStart(4, '0')}`,
        tagIds[index % tagIds.length],
      ]);
    }
    await tx.query(`INSERT INTO tcc_view_events (id,tcc_id,occurred_at)
      SELECT 'event-' || id, id, CURRENT_TIMESTAMP - interval '1 day' FROM tccs WHERE status = 'PUBLICADO'`);
    await tx.query(`INSERT INTO tcc_view_event_tags (event_id,tag_id)
      SELECT event.id, tt.tag_id FROM tcc_view_events event JOIN tcc_tags tt ON tt.tcc_id = event.tcc_id`);
  });
  await rebuildSemanticDocuments(db);
  await db.exec('ANALYZE');
  const tccs = createTccRepository(observed);
  const discovery = createDiscoveryRepository(observed);
  const related = createRelatedRepository(observed);
  const semantic = createSemanticSearchService(observed);
  const operations = [
    {
      name: 'recent_page',
      run: () => tccs.listPublic({ page: 1, pageSize: 20 }),
    },
    {
      name: 'combined_filters',
      run: () =>
        tccs.listPublic({
          year: 2025,
          advisorId: fixtures.carlos.id,
          tagIds: [fixtures.tags.redes.id],
          pageSize: 20,
        }),
    },
    {
      name: 'text_search',
      run: () => tccs.listPublic({ term: 'mobilidade', pageSize: 20 }),
    },
    {
      name: 'second_page',
      run: () => tccs.listPublic({ page: 2, pageSize: 20 }),
    },
    { name: 'feed', run: () => discovery.feed() },
    { name: 'related', run: () => related.findRelated('measure-0000') },
    {
      name: 'semantic_cached',
      run: () => semantic.search({ term: 'automóveis', pageSize: 20 }),
    },
  ];
  const coldStart = performance.now();
  const firstSemantic = await semantic.search({
    term: 'automóveis',
    pageSize: 20,
  });
  const coldSemanticMs = performance.now() - coldStart;
  const measurements = [];
  const representativePlans = [];
  for (const operation of operations) {
    await operation.run();
    const durations = [];
    captured.length = 0;
    for (let iteration = 0; iteration < samples; iteration++) {
      const start = performance.now();
      await operation.run();
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    measurements.push({
      operation: operation.name,
      samples,
      minMs: +durations[0]!.toFixed(2),
      medianMs: +durations[Math.floor(samples / 2)]!.toFixed(2),
      maxMs: +durations.at(-1)!.toFixed(2),
    });
    const representative = captured.find(
      ({ sql }) =>
        /^\s*(SELECT|WITH)/.test(sql) &&
        /ORDER BY/.test(sql) &&
        /LIMIT/.test(sql),
    );
    if (representative) {
      const explanation = await db.query<{ 'QUERY PLAN': unknown }>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${representative.sql}`,
        representative.params,
      );
      representativePlans.push({
        operation: operation.name,
        plan: explanation.rows[0]!['QUERY PLAN'],
      });
    }
  }
  const counts = (
    await db.query<{
      published: number;
      drafts: number;
      indexed: number;
    }>(`SELECT
    (SELECT count(*)::integer FROM tccs WHERE status = 'PUBLICADO') AS published,
    (SELECT count(*)::integer FROM tccs WHERE status = 'RASCUNHO') AS drafts,
    (SELECT count(*)::integer FROM semantic_documents) AS indexed`)
  ).rows[0];
  console.log(
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        engine: 'PGlite / PostgreSQL em memória',
        dataset:
          'Fictício e isolado; 180 cópias do corpus semântico, 20 rascunhos e fixtures A-E',
        counts,
        semanticCold: {
          elapsedMs: +coldSemanticMs.toFixed(2),
          mode: firstSemantic.search.mode,
          fallbackReason: firstSemantic.search.fallbackReason,
        },
        measurements,
        representativePlans,
        limitations: [
          'Sem rede, TLS, concorrência ou serviços reais.',
          'Cinco amostras locais por operação; não constitui SLA, p95 ou benchmark de produção.',
          'Termo textual usa substring normalizada; o índice B-tree não acelera essa condição.',
          'LSA tem teto de 512 publicados e treinamento limitado a dois segundos; corpus maior usa fallback explícito.',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
