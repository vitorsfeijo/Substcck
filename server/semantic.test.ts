import { afterEach, describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  createLatentIndex,
  SEMANTIC_LIMITS,
  SemanticUnavailableError,
  type SemanticDocument,
} from './semantic/lsa.js';
import { buildSemanticTerms, tokenizeQuery } from './semantic/text.js';
import {
  semanticEvaluationCorpus,
  semanticEvaluationDocuments,
  semanticEvaluationQueries,
} from './semantic/evaluation.js';

afterEach(() => vi.restoreAllMocks());

function expectUnavailable(
  work: () => unknown,
  reason: SemanticUnavailableError['reason'],
) {
  try {
    work();
    expect.fail('Expected an unavailable semantic representation.');
  } catch (error) {
    expect(error).toBeInstanceOf(SemanticUnavailableError);
    expect((error as SemanticUnavailableError).reason).toBe(reason);
  }
}

describe('Portuguese semantic representation', () => {
  it('normalizes accents and case, removes basic stopwords and preserves field weights', () => {
    expect(
      tokenizeQuery('A PRIVACIDADE dos prontuários, em Saúde e IA.'),
    ).toEqual(['privacidade', 'prontuarios', 'saude', 'ia']);
    expect(
      buildSemanticTerms({
        title: 'Saúde e IA',
        summary: 'Saúde, dados e IA.',
        tags: ['IA'],
        areas: ['Saúde'],
        collection: 'Dados',
      }),
    ).toEqual({ dados: 2, ia: 6, saude: 5 });
  });

  it('retrieves all three evaluation targets through learned co-occurrence with no direct query tokens', () => {
    const documents = semanticEvaluationDocuments();
    const index = createLatentIndex(documents);
    expect(index.dimensions).toBe(3);
    expect(index.vocabularySize).toBeGreaterThan(20);
    for (const evaluation of semanticEvaluationQueries) {
      const target = documents.find(
        (item) => item.id === evaluation.expectedId,
      )!;
      expect(
        tokenizeQuery(evaluation.query).some((term) =>
          Object.hasOwn(target.terms, term),
        ),
      ).toBe(false);
      const hits = index.query(evaluation.query);
      expect(hits.slice(0, 3).map((hit) => hit.id)).toContain(
        evaluation.expectedId,
      );
      expect(
        hits.slice(0, 3).every((hit) => hit.id.startsWith(evaluation.group)),
      ).toBe(true);
      expect(
        hits.every(
          (hit) =>
            Number.isFinite(hit.score) &&
            hit.score >= SEMANTIC_LIMITS.minimumCosine &&
            hit.score <= 1,
        ),
      ).toBe(true);
    }
  });

  it('has the same learned ranking with case, accent, source order and repeated builds', () => {
    const documents = semanticEvaluationDocuments();
    const first = createLatentIndex(documents);
    const reversed = createLatentIndex([...documents].reverse());
    expect(first.query('PROTEÇÃO PRIVACIDADE')).toEqual(
      first.query('protecao privacidade'),
    );
    expect(reversed.query('automóveis')).toEqual(first.query('automóveis'));
    expect(createLatentIndex(documents).query('colheita')).toEqual(
      first.query('colheita'),
    );
  });

  it('does not match unrelated known topics and reports vocabulary absence for unknown queries', () => {
    const index = createLatentIndex(semanticEvaluationDocuments());
    expect(index.query('irrigação').map((hit) => hit.id)).not.toContain(
      'saude-criptografia',
    );
    expect(
      index.query('irrigação').every((hit) => hit.id.startsWith('agro-')),
    ).toBe(true);
    for (const query of ['astronomia galáxias', 'a e de para'])
      expectUnavailable(() => index.query(query), 'query_out_of_vocabulary');
  });

  it('uses IDs only to break equal scores rather than influence the semantic representation', () => {
    const documents = semanticEvaluationDocuments();
    const terms = documents.find(
      (item) => item.id === 'saude-criptografia',
    )!.terms;
    const hits = createLatentIndex([
      ...documents.filter((item) => item.id !== 'saude-criptografia'),
      { id: 'duplicado-b', terms },
      { id: 'duplicado-a', terms },
    ]).query('privacidade');
    const duplicates = hits.filter((hit) => hit.id.startsWith('duplicado-'));
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0]!.score).toBe(duplicates[1]!.score);
    expect(duplicates.map((hit) => hit.id)).toEqual([
      'duplicado-a',
      'duplicado-b',
    ]);
    const original = createLatentIndex(documents).query('privacidade');
    const renamed = documents.map((document, index) => ({
      ...document,
      id: `outro-${documents.length - index}`,
    }));
    const remapping = new Map(
      renamed.map((document, index) => [document.id, documents[index]!.id]),
    );
    const renamedHits = createLatentIndex(renamed).query('privacidade');
    for (const hit of renamedHits) {
      expect(hit.score).toBeCloseTo(
        original.find((previous) => previous.id === remapping.get(hit.id))!
          .score,
        10,
      );
    }
  });

  it('does not amplify discarded-topic residue into a match after a document changes meaning', () => {
    const documents = semanticEvaluationCorpus.map(({ id, ...source }) => {
      const group = id.split('-')[0];
      const tags =
        group === 'saude'
          ? ['Sigilo']
          : group === 'redes'
            ? ['Veicular']
            : ['Agrícola'];
      return {
        id,
        terms: buildSemanticTerms({
          ...source,
          tags,
          areas: group === 'saude' ? ['Clínica'] : [],
          collection: group === 'saude' ? 'Hospitais' : null,
        }),
      };
    });
    expect(
      createLatentIndex(documents)
        .query('proteção privacidade')
        .map((hit) => hit.id),
    ).toContain('saude-criptografia');
    const changed = documents.map((document) =>
      document.id === 'saude-criptografia'
        ? {
            ...document,
            terms: buildSemanticTerms({
              title: 'Compiladores e análise sintática',
              summary: 'Gramáticas e tradução de programas.',
              tags: ['Compiladores'],
              areas: [],
              collection: null,
            }),
          }
        : document,
    );
    const index = createLatentIndex(changed);
    expect(
      index.query('proteção privacidade').map((hit) => hit.id),
    ).not.toContain('saude-criptografia');
    expectUnavailable(
      () => index.query('gramáticas compiladores'),
      'query_out_of_vocabulary',
    );
  });

  it('refuses a one-dimensional cosine when the corpus cannot support meaningful truncation', () => {
    const documents: SemanticDocument[] = [
      { id: 'a', terms: { redes: 2, pacotes: 1 } },
      { id: 'b', terms: { redes: 2, pacotes: 1 } },
      { id: 'c', terms: { saude: 2, pacientes: 1 } },
    ];
    expectUnavailable(() => createLatentIndex(documents), 'index_unavailable');
    expectUnavailable(
      () =>
        createLatentIndex(
          documents.map((item) => ({ ...item, terms: documents[0]!.terms })),
        ),
      'index_unavailable',
    );
  });

  it('refuses incomplete, corrupt or excessive corpora rather than silently truncating them', () => {
    const valid = semanticEvaluationDocuments();
    expectUnavailable(
      () => createLatentIndex(valid.slice(0, 2)),
      'insufficient_corpus',
    );
    expectUnavailable(
      () => createLatentIndex([...valid, valid[0]!]),
      'index_unavailable',
    );
    const invalidTerms: Record<string, number>[] = [
      { redes: Number.NaN },
      { redes: Number.POSITIVE_INFINITY },
      { redes: -1 },
      { redes: 0 },
      { redes: 0.5 },
      { redes: Number.MAX_SAFE_INTEGER + 1 },
      { 'Não normalizado': 1 },
      {},
    ];
    for (const terms of invalidTerms)
      expectUnavailable(
        () => createLatentIndex([{ id: 'broken', terms }, ...valid]),
        'index_unavailable',
      );
    const tooMany = Array.from(
      { length: SEMANTIC_LIMITS.documents + 1 },
      (_, i) => ({ id: String(i), terms: { redes: 1 } }),
    );
    expectUnavailable(() => createLatentIndex(tooMany), 'corpus_limit');
    const vocabulary = Object.fromEntries(
      Array.from({ length: SEMANTIC_LIMITS.vocabulary + 1 }, (_, i) => [
        `termo${i}`,
        1,
      ]),
    );
    expectUnavailable(
      () => createLatentIndex([{ id: 'huge', terms: vocabulary }, ...valid]),
      'corpus_limit',
    );
  });

  it('stops training after its total time budget rather than restarting the deadline per iteration', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      now += 1000;
      return now;
    });
    expectUnavailable(
      () => createLatentIndex(semanticEvaluationDocuments()),
      'index_unavailable',
    );
  });
});
