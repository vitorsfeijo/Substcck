import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDevelopmentIdentity } from '../auth/development.js';
import { readConfig } from '../config.js';
import { openDatabase, type Database } from '../data/database.js';
import { migrate } from '../data/migrate.js';
import type { TccDTO } from '../models/tcc.js';
import { createIdentityRepository } from '../repositories/identity.js';
import { createTccRepository } from '../repositories/tcc.js';

/** Explicit demo fixtures for local development/tests; never a production import. */
export async function seedDevelopmentData(
  db: Database,
  config: { environment: string; databaseUrl?: string },
) {
  if (
    !['development', 'test'].includes(config.environment) ||
    config.databaseUrl
  ) {
    throw new Error(
      'Os dados de demonstração só podem ser criados no banco local de desenvolvimento/teste.',
    );
  }
  const identities = createIdentityRepository(db);
  const author = await identities.upsert(getDevelopmentIdentity('author'));
  const researcher = await identities.upsert(
    getDevelopmentIdentity('researcher'),
  );
  const professor = await identities.upsert(
    getDevelopmentIdentity('professor'),
  );
  const advisors = await Promise.all([
    identities.upsert({
      issuer: 'urn:subtccstack:development',
      subject: 'carlos',
      name: 'Prof. Carlos Lima',
      email: 'carlos@example.invalid',
      institutionalLogin: 'dev-carlos',
      role: 'professor',
      department: 'Instituto de Informática (demonstração)',
    }),
    identities.upsert({
      issuer: 'urn:subtccstack:development',
      subject: 'ana',
      name: 'Profª Ana Reis',
      email: 'ana@example.invalid',
      institutionalLogin: 'dev-ana',
      role: 'professor',
      department: 'Instituto de Informática (demonstração)',
    }),
  ]);
  const carlos = advisors[0]!;
  const ana = advisors[1]!;
  await db.query(
    'INSERT INTO areas (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    ['demo-area-computing', 'Computação (demonstração)'],
  );
  await db.query(
    'INSERT INTO collections (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    ['demo-collection-inf', 'TCCs INF (demonstração)'],
  );
  const repository = createTccRepository(db);
  const redes = await repository.ensureTag('Redes', 'demo-area-computing');
  const ia = await repository.ensureTag('IA', 'demo-area-computing');
  const seguranca = await repository.ensureTag(
    'Segurança',
    'demo-area-computing',
  );
  const works: Record<string, TccDTO> = {};
  const entries = [
    {
      key: 'A',
      year: 2025,
      semester: 1,
      defendedAt: '2025-05-20',
      advisorId: carlos.id,
      tag: redes.id,
    },
    {
      key: 'B',
      year: 2025,
      semester: 1,
      defendedAt: '2025-05-21',
      advisorId: carlos.id,
      tag: ia.id,
    },
    {
      key: 'C',
      year: 2024,
      semester: 2,
      defendedAt: '2024-11-20',
      advisorId: carlos.id,
      tag: redes.id,
    },
    {
      key: 'D',
      year: 2025,
      semester: 1,
      defendedAt: '2025-05-22',
      advisorId: ana.id,
      tag: redes.id,
    },
    {
      key: 'E',
      year: 2025,
      semester: 1,
      defendedAt: '2025-05-23',
      advisorId: carlos.id,
      tag: redes.id,
    },
  ];
  for (const entry of entries) {
    const title = `Demonstração ${entry.key} - ${entry.tag === redes.id ? 'Redes' : 'IA'}`;
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM tccs WHERE title = $1 AND author_id = $2',
      [title, author.id],
    );
    works[entry.key] = await repository.save(
      {
        id: existing.rows[0]?.id,
        title,
        summary:
          'Dados fictícios para reproduzir os filtros do CT03; não representam uma pesquisa publicada.',
        year: entry.year,
        semester: entry.semester,
        defendedAt: entry.defendedAt,
        advisorId: entry.advisorId,
        lumeUrl: `https://lume.ufrgs.br/handle/10183/demo-${entry.key.toLowerCase()}`,
        status: entry.key === 'E' ? 'RASCUNHO' : 'PUBLICADO',
        tagIds: [entry.tag],
        collectionId: 'demo-collection-inf',
      },
      author.id,
    );
  }
  return {
    author,
    researcher,
    professor,
    carlos,
    ana,
    tags: { redes, ia, seguranca },
    works,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const config = readConfig();
  if (config.environment === 'production' || config.databaseUrl) {
    throw new Error(
      'A carga de demonstração não pode usar produção ou um banco remoto.',
    );
  }
  const db = await openDatabase(config);
  try {
    await migrate(db);
    await seedDevelopmentData(db, config);
    console.log(
      'Dados locais de demonstração A-E preparados. Nenhuma identidade ou sessão institucional real foi criada.',
    );
  } finally {
    await db.close();
  }
}
