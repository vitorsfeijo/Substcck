import { createHash } from 'node:crypto';
import type { Database } from '../data/database.js';
import type { TccDTO, TccFilter, TccPage } from '../models/tcc.js';
import { createTccRepository } from '../repositories/tcc.js';
import { validateTccFilter } from './tcc-validation.js';
import { semanticVersion } from '../semantic/documents.js';
import {
  createLatentIndex,
  SemanticUnavailableError,
  type SemanticUnavailableReason,
} from '../semantic/lsa.js';

const fallbackNotice =
  'A busca por significado está indisponível para esta consulta. Exibindo resultados por texto.';

export interface SemanticSearchPage extends TccPage {
  search: {
    requestedMode: 'semantic';
    mode: 'semantic' | 'text';
    fallbackReason: SemanticUnavailableReason | null;
    notice?: string;
  };
}

interface IndexRow extends Record<string, unknown> {
  id: string;
  terms: Record<string, number> | null;
  source_hash: string | null;
  version: string | null;
  stale: boolean;
}

function recency(a: TccDTO, b: TccDTO) {
  return (
    (b.defendedAt || '').localeCompare(a.defendedAt || '') ||
    (b.publishedAt || '').localeCompare(a.publishedAt || '') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Cache entries are tied to the complete public representation, not a TTL. */
export function createSemanticSearchService(db: Database) {
  let cached:
    | { fingerprint: string; model: ReturnType<typeof createLatentIndex> }
    | undefined;
  return {
    async search(input: TccFilter): Promise<SemanticSearchPage> {
      const filter = validateTccFilter(input);
      try {
        return await db.transaction(async (tx) => {
          // One bounded read-only snapshot prevents ranking one revision and exposing another.
          await tx.exec(
            'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
          );
          const rows = await tx.query<IndexRow>(
            `SELECT t.id, d.terms, d.source_hash, d.version,
               (d.tcc_id IS NULL OR d.source_updated_at IS DISTINCT FROM t.updated_at) AS stale
             FROM tccs t LEFT JOIN semantic_documents d ON d.tcc_id = t.id
             WHERE t.status = 'PUBLICADO' ORDER BY t.id LIMIT 513`,
          );
          if (rows.rows.length > 512)
            throw new SemanticUnavailableError('corpus_limit');
          if (
            rows.rows.some(
              (row) =>
                row.stale || row.version !== semanticVersion || !row.terms,
            )
          )
            throw new SemanticUnavailableError('index_unavailable');
          const fingerprint = createHash('sha256')
            .update(JSON.stringify(rows.rows))
            .digest('hex');
          if (cached?.fingerprint !== fingerprint) {
            cached = undefined;
            const model = createLatentIndex(
              rows.rows.map((row) => ({ id: row.id, terms: row.terms! })),
            );
            cached = { fingerprint, model };
          }
          const ranked = cached.model.query(filter.term || '');
          const connection: Database = {
            query: (sql, params) => tx.query(sql, params),
            exec: (sql) => tx.exec(sql),
            transaction: (work) => work(tx),
            close: async () => {},
          };
          const repository = createTccRepository(connection);
          const candidates: TccDTO[] = [];
          for (let page = 1; page <= 6; page++) {
            const result = await repository.listPublic({
              ...filter,
              term: undefined,
              page,
              pageSize: 100,
            });
            candidates.push(...result.items);
            if (candidates.length >= result.total) break;
          }
          const score = new Map(ranked.map((hit) => [hit.id, hit.score]));
          const matches = candidates.filter((work) => score.has(work.id));
          matches.sort(
            (a, b) => score.get(b.id)! - score.get(a.id)! || recency(a, b),
          );
          return {
            items: matches.slice(
              (filter.page - 1) * filter.pageSize,
              filter.page * filter.pageSize,
            ),
            total: matches.length,
            page: filter.page,
            pageSize: filter.pageSize,
            search: {
              requestedMode: 'semantic',
              mode: 'semantic',
              fallbackReason: null,
            },
          };
        });
      } catch (error) {
        cached = undefined;
        const fallbackReason =
          error instanceof SemanticUnavailableError
            ? error.reason
            : 'index_unavailable';
        const result = await createTccRepository(db).listPublic(filter);
        return {
          ...result,
          search: {
            requestedMode: 'semantic',
            mode: 'text',
            fallbackReason,
            notice: fallbackNotice,
          },
        };
      }
    },
  };
}
