import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import {
  TccAccessError,
  TccValidationError,
  type TccWriteInput,
} from './models/tcc.js';
import { createTccRepository } from './repositories/tcc.js';
import { seedDevelopmentData } from './scripts/seed.js';
import { validateTccInput } from './services/tcc-validation.js';

describe('TCC domain persistence and visibility', () => {
  let db: Database;
  let repository: ReturnType<typeof createTccRepository>;
  let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;

  beforeAll(async () => {
    db = await openDatabase({ dataDir: 'memory://' });
    await migrate(db);
    repository = createTccRepository(db);
    fixtures = await seedDevelopmentData(db, { environment: 'test' });
  });

  afterAll(async () => {
    await db?.close();
  });

  it('combines the CT03 filters and excludes drafts before pagination', async () => {
    const result = await repository.listPublic({
      year: 2025,
      advisorId: fixtures.carlos.id,
      tagIds: [fixtures.tags.redes.id],
    });
    expect(result.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual([fixtures.works.A!.id]);
    expect(
      (
        await repository.listPublic({
          year: 2023,
          tagIds: [fixtures.tags.redes.id],
        })
      ).items,
    ).toEqual([]);
    const first = await repository.listPublic({ pageSize: 2 });
    const second = await repository.listPublic({ pageSize: 2, page: 2 });
    expect(first.total).toBe(4);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([
      fixtures.works.D!.id,
      fixtures.works.B!.id,
      fixtures.works.A!.id,
      fixtures.works.C!.id,
    ]);
    expect(
      (
        await repository.listPublic({
          term: 'demonstracao',
          areaIds: ['demo-area-computing'],
          collectionId: 'demo-collection-inf',
          dateFrom: '2025-01-01',
          dateTo: '2025-12-31',
        })
      ).total,
    ).toBe(3);
  });

  it('keeps private drafts invisible to public readers and other authors', async () => {
    const id = fixtures.works.E!.id;
    expect(await repository.findPublicById(id)).toBeNull();
    expect(
      await repository.findOwnedById(id, fixtures.researcher.id),
    ).toBeNull();
    expect(
      (await repository.findOwnedById(id, fixtures.author.id))?.status,
    ).toBe('RASCUNHO');
    expect((await repository.listOwned(fixtures.author.id)).total).toBe(5);
    expect((await repository.listOwned(fixtures.researcher.id)).total).toBe(0);
    await expect(repository.findOwnedById(id, '')).rejects.toBeInstanceOf(
      TccAccessError,
    );
    await expect(repository.listOwned('')).rejects.toBeInstanceOf(
      TccAccessError,
    );
    await expect(
      repository.save(
        { id, title: 'Ataque', status: 'RASCUNHO' },
        fixtures.researcher.id,
      ),
    ).rejects.toBeInstanceOf(TccAccessError);
    await expect(
      repository.save(
        { title: 'Sem papel de aluno', status: 'RASCUNHO' },
        fixtures.professor.id,
      ),
    ).rejects.toBeInstanceOf(TccAccessError);
    expect(
      (await repository.findOwnedById(id, fixtures.author.id))?.title,
    ).toContain('Demonstração E');
  });

  it('round-trips every DTO field and updates atomically without unpublishing', async () => {
    const input: TccWriteInput = {
      title: 'Pesquisa de demonstração completa',
      summary: 'Resumo acessível.',
      year: 2025,
      semester: 2,
      defendedAt: '2025-10-15',
      advisorId: fixtures.carlos.id,
      coadvisorId: fixtures.ana.id,
      lumeUrl: 'https://lume.ufrgs.br/handle/10183/demo',
      status: 'PUBLICADO',
      tagIds: [fixtures.tags.redes.id, fixtures.tags.ia.id],
      collectionId: 'demo-collection-inf',
      media: [
        {
          id: 'test-media-complete',
          url: '/assets/test-media.png',
          description: 'Figura de demonstração',
        },
      ],
      file: {
        id: 'test-file-complete',
        originalName: 'artigo.pdf',
        format: 'PDF',
        path: 'documents/test-file-complete.pdf',
      },
    };
    const work = await repository.save(input, fixtures.author.id);
    expect(work.author).toEqual({
      id: fixtures.author.id,
      name: fixtures.author.name,
    });
    expect(work.coadvisor?.id).toBe(fixtures.ana.id);
    expect(work.tags.map((tag) => tag.id).sort()).toEqual(
      [...input.tagIds!].sort(),
    );
    expect(work.tags[0]?.area?.id).toBe('demo-area-computing');
    expect(work.collection?.id).toBe('demo-collection-inf');
    expect(work.media).toEqual(input.media);
    expect(work.file).toEqual(input.file);
    expect(work.defendedAt).toBe('2025-10-15');
    expect(work.publishedAt).toBeTruthy();
    const updated = await repository.save(
      { ...input, id: work.id, title: 'Pesquisa revisada' },
      fixtures.author.id,
    );
    expect(updated.id).toBe(work.id);
    expect(updated.publishedAt).toBe(work.publishedAt);
    await expect(
      repository.save(
        { ...input, id: work.id, advisorId: fixtures.researcher.id },
        fixtures.author.id,
      ),
    ).rejects.toBeInstanceOf(TccValidationError);
    await expect(
      repository.save(
        {
          ...input,
          id: work.id,
          title: 'Não deve sobrescrever',
          media: [
            { id: 'duplicate-media', url: '/1.png', description: '' },
            { id: 'test-media-complete', url: '/2.png', description: '' },
            { id: 'duplicate-media', url: '/3.png', description: '' },
          ],
        },
        fixtures.author.id,
      ),
    ).rejects.toBeInstanceOf(TccValidationError);
    await expect(
      repository.save(
        { id: work.id, title: 'Não despublicar', status: 'RASCUNHO' },
        fixtures.author.id,
      ),
    ).rejects.toBeInstanceOf(TccValidationError);
    expect((await repository.findPublicById(work.id))?.title).toBe(
      'Pesquisa revisada',
    );
    const multi = await repository.listPublic({
      tagIds: [fixtures.tags.redes.id, fixtures.tags.ia.id],
    });
    expect(multi.items.map((item) => item.id)).toEqual([work.id]);
  });

  it('rejects invalid relationships and publication cardinality in SQL transactions', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('UPDATE tccs SET advisor_id = $1 WHERE id = $2', [
          fixtures.researcher.id,
          fixtures.works.A!.id,
        ]);
      }),
    ).rejects.toThrow();
    await expect(
      db.transaction(async (tx) => {
        await tx.query('DELETE FROM tcc_tags WHERE tcc_id = $1', [
          fixtures.works.A!.id,
        ]);
      }),
    ).rejects.toThrow();
    expect(
      (await repository.findPublicById(fixtures.works.A!.id))?.tags,
    ).toHaveLength(1);
    expect(
      (await repository.findPublicById(fixtures.works.A!.id))?.advisor?.id,
    ).toBe(fixtures.carlos.id);
  });

  it('deduplicates tag case/spacing, rejects invalid pagination and guards the demo seed', async () => {
    const same = await repository.ensureTag('  rEdEs  ');
    expect(same.id).toBe(fixtures.tags.redes.id);
    await expect(repository.ensureTag('x'.repeat(51))).rejects.toBeInstanceOf(
      TccValidationError,
    );
    await expect(
      repository.listPublic({ pageSize: 101 }),
    ).rejects.toBeInstanceOf(TccValidationError);
    await expect(
      repository.listPublic({ dateFrom: '2025-02-30' }),
    ).rejects.toBeInstanceOf(TccValidationError);
    await expect(
      seedDevelopmentData(db, { environment: 'production' }),
    ).rejects.toThrow(/só podem/);
    await expect(
      seedDevelopmentData(db, {
        environment: 'development',
        databaseUrl: 'postgresql://remote/database',
      }),
    ).rejects.toThrow(/só podem/);
  });
});

describe('publication and draft validation', () => {
  it('rejects malformed untrusted fields without runtime type errors', () => {
    for (const value of [
      null,
      { title: 'Rascunho', status: 'RASCUNHO', media: [null] },
      {
        title: 'Rascunho',
        status: 'RASCUNHO',
        file: { id: 'x', format: 'PDF', originalName: 4, path: 'x.pdf' },
      },
      { title: 'Rascunho', status: 'RASCUNHO', summary: { invalid: true } },
      { title: 'Rascunho', status: 'RASCUNHO', lumeUrl: 123 },
    ])
      expect(() => validateTccInput(value as unknown as TccWriteInput)).toThrow(
        TccValidationError,
      );
  });
  it('accepts an incomplete titled draft but rejects blank title, excess tags/media and invalid dates', () => {
    expect(
      validateTccInput({ title: '  Rascunho  ', status: 'RASCUNHO' }).title,
    ).toBe('Rascunho');
    for (const input of [
      { title: '', status: 'RASCUNHO' },
      { title: 'TCC', status: 'PUBLICADO' },
      {
        title: 'TCC',
        status: 'RASCUNHO',
        tagIds: ['1', '2', '3', '4', '5', '6'],
      },
      { title: 'TCC', status: 'RASCUNHO', tagIds: ['1', '1'] },
      {
        title: 'TCC',
        status: 'RASCUNHO',
        year: 2025,
        defendedAt: '2024-12-01',
      },
      { title: 'TCC', status: 'RASCUNHO', defendedAt: '2025-02-30' },
      { title: 'TCC', status: 'RASCUNHO', defendedAt: '2099-01-01' },
      { title: 'TCC', status: 'RASCUNHO', advisorId: '1', coadvisorId: '1' },
      {
        title: 'TCC',
        status: 'RASCUNHO',
        media: [0, 1, 2, 3].map((id) => ({
          id: String(id),
          url: '/image.png',
          description: '',
        })),
      },
    ] as TccWriteInput[]) {
      expect(() => validateTccInput(input, '2026-10-27')).toThrow(
        TccValidationError,
      );
    }
  });
});
