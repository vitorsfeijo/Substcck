import type { Database } from '../data/database.js';
import type { RelatedWorks } from '../models/related.js';
import { TccAccessError, type NamedEntity } from '../models/tcc.js';
import { createTccRepository } from './tcc.js';

interface RelatedRow extends Record<string, unknown> {
  id: string;
  shared_tags: NamedEntity[];
  shared_areas: NamedEntity[];
  score: number;
}

/** Classification similarity is explicit and independent of authorship or popularity. */
export function createRelatedRepository(db: Database) {
  return {
    async findRelated(originId: string): Promise<RelatedWorks> {
      return db.transaction(async (tx) => {
        await tx.exec(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        const origin = await tx.query(
          "SELECT id FROM tccs WHERE id = $1 AND status = 'PUBLICADO'",
          [originId],
        );
        if (!origin.rows.length) throw new TccAccessError();
        const candidates = await tx.query<RelatedRow>(
          `WITH origin_tags AS (
             SELECT tag_id FROM tcc_tags WHERE tcc_id = $1
           ), origin_areas AS (
             SELECT DISTINCT tag.area_id FROM tags tag
             JOIN origin_tags selected ON selected.tag_id = tag.id
             WHERE tag.area_id IS NOT NULL
           ), common AS (
             SELECT t.id, t.defended_at, t.published_at,
               COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) ORDER BY tag.name, tag.id)
                 FROM tcc_tags tt JOIN tags tag ON tag.id = tt.tag_id
                 WHERE tt.tcc_id = t.id AND tag.id IN (SELECT tag_id FROM origin_tags)), '[]'::jsonb) AS shared_tags,
               COALESCE((SELECT jsonb_agg(jsonb_build_object('id', area.id, 'name', area.name) ORDER BY area.name, area.id)
                 FROM areas area WHERE area.id IN (SELECT area_id FROM origin_areas)
                   AND EXISTS (SELECT 1 FROM tcc_tags tt JOIN tags tag ON tag.id = tt.tag_id
                     WHERE tt.tcc_id = t.id AND tag.area_id = area.id)), '[]'::jsonb) AS shared_areas
             FROM tccs t WHERE t.status = 'PUBLICADO' AND t.id <> $1
           ), ranked AS (
             SELECT *, 4 * jsonb_array_length(shared_tags) + jsonb_array_length(shared_areas) AS score FROM common
           )
           SELECT id, shared_tags, shared_areas, score FROM ranked WHERE score > 0
           ORDER BY score DESC, defended_at DESC NULLS LAST, published_at DESC NULLS LAST, id
           LIMIT 4`,
          [originId],
        );
        const connection: Database = {
          query: (sql, params) => tx.query(sql, params),
          exec: (sql) => tx.exec(sql),
          transaction: (work) => work(tx),
          close: async () => {},
        };
        const repository = createTccRepository(connection);
        // At most four bounded DTO reads reuse the audited public projection.
        const items = await Promise.all(
          candidates.rows.map(async (row) => {
            const tcc = await repository.findPublicById(row.id);
            return tcc
              ? {
                  tcc,
                  sharedTags: row.shared_tags,
                  sharedAreas: row.shared_areas,
                  score: row.score,
                }
              : null;
          }),
        );
        return { items: items.filter((item) => item !== null) };
      });
    },
  };
}
