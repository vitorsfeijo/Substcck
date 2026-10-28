import { randomUUID } from 'node:crypto';
import type { Database } from '../data/database.js';
import type { FeedDTO, NamedEntity, TagDTO } from '../models/tcc.js';
import { TccAccessError } from '../models/tcc.js';
import { createTccRepository } from './tcc.js';

export interface DiscoveryOptions {
  authors: NamedEntity[];
  advisors: NamedEntity[];
  years: number[];
  tags: TagDTO[];
  areas: NamedEntity[];
  collections: NamedEntity[];
}

/** All public discovery queries scope visibility before selecting or aggregating. */
export function createDiscoveryRepository(db: Database) {
  return {
    async options(): Promise<DiscoveryOptions> {
      const [authors, advisors, years, tags, areas, collections] =
        await Promise.all([
          db.query<{ id: string; name: string }>(
            `SELECT DISTINCT u.id, u.name FROM users u JOIN tccs t ON t.author_id = u.id
             WHERE t.status = 'PUBLICADO' ORDER BY u.name, u.id`,
          ),
          db.query<{ id: string; name: string }>(
            `SELECT DISTINCT u.id, u.name FROM users u JOIN tccs t ON t.advisor_id = u.id
             WHERE t.status = 'PUBLICADO' ORDER BY u.name, u.id`,
          ),
          db.query<{ year: number }>(
            `SELECT DISTINCT year FROM tccs WHERE status = 'PUBLICADO' AND year IS NOT NULL ORDER BY year DESC`,
          ),
          db.query<{
            id: string;
            name: string;
            area: NamedEntity | null;
          }>(
            `SELECT DISTINCT tag.id, tag.name,
              CASE WHEN area.id IS NULL THEN NULL ELSE jsonb_build_object('id', area.id, 'name', area.name) END AS area
             FROM tags tag JOIN tcc_tags tt ON tt.tag_id = tag.id JOIN tccs t ON t.id = tt.tcc_id
             LEFT JOIN areas area ON area.id = tag.area_id WHERE t.status = 'PUBLICADO' ORDER BY tag.name, tag.id`,
          ),
          db.query<{ id: string; name: string }>(
            `SELECT DISTINCT area.id, area.name FROM areas area JOIN tags tag ON tag.area_id = area.id
             JOIN tcc_tags tt ON tt.tag_id = tag.id JOIN tccs t ON t.id = tt.tcc_id
             WHERE t.status = 'PUBLICADO' ORDER BY area.name, area.id`,
          ),
          db.query<{ id: string; name: string }>(
            `SELECT DISTINCT c.id, c.name FROM collections c JOIN tccs t ON t.collection_id = c.id
             WHERE t.status = 'PUBLICADO' ORDER BY c.name, c.id`,
          ),
        ]);
      return {
        authors: authors.rows,
        advisors: advisors.rows,
        years: years.rows.map((row) => row.year),
        tags: tags.rows,
        areas: areas.rows,
        collections: collections.rows,
      };
    },

    async feed(now = new Date()): Promise<FeedDTO> {
      const [recent, topics] = await Promise.all([
        createTccRepository(db).listPublic({ page: 1, pageSize: 8 }),
        db.query<{
          id: string;
          name: string;
          area: NamedEntity | null;
          views: string | number;
        }>(
          `SELECT tag.id, tag.name,
             CASE WHEN area.id IS NULL THEN NULL ELSE jsonb_build_object('id', area.id, 'name', area.name) END AS area,
             count(*) AS views
           FROM tcc_view_events event JOIN tccs t ON t.id = event.tcc_id
           JOIN tcc_view_event_tags event_tag ON event_tag.event_id = event.id
           JOIN tags tag ON tag.id = event_tag.tag_id LEFT JOIN areas area ON area.id = tag.area_id
           WHERE t.status = 'PUBLICADO' AND event.occurred_at >= $1::timestamptz - interval '30 days'
             AND event.occurred_at <= $1::timestamptz
           GROUP BY tag.id, tag.name, tag.normalized_name, area.id, area.name
           ORDER BY count(*) DESC, tag.normalized_name, tag.id LIMIT 8`,
          [now.toISOString()],
        ),
      ]);
      return {
        recent: recent.items,
        topics: topics.rows.map((row) => ({
          ...row,
          views: Number(row.views),
        })),
        windowDays: 30,
      };
    },

    /** The clock argument supports deterministic tests; HTTP never accepts a timestamp. */
    async recordView(tccId: string, sessionHash: string, now = new Date()) {
      return db.transaction(async (tx) => {
        const work = await tx.query(
          "SELECT id FROM tccs WHERE id = $1 AND status = 'PUBLICADO' FOR UPDATE",
          [tccId],
        );
        if (!work.rows.length) throw new TccAccessError();
        const counted = await tx.query(
          `INSERT INTO tcc_view_sessions (tcc_id, session_hash, last_counted_at) VALUES ($1, $2, $3)
           ON CONFLICT (tcc_id, session_hash) DO UPDATE SET last_counted_at = EXCLUDED.last_counted_at
           WHERE tcc_view_sessions.last_counted_at <= EXCLUDED.last_counted_at - interval '30 minutes'
           RETURNING tcc_id`,
          [tccId, sessionHash, now.toISOString()],
        );
        if (!counted.rows.length) return { counted: false };
        const id = randomUUID();
        await tx.query(
          'INSERT INTO tcc_view_events (id, tcc_id, occurred_at) VALUES ($1, $2, $3)',
          [id, tccId, now.toISOString()],
        );
        await tx.query(
          'INSERT INTO tcc_view_event_tags (event_id, tag_id) SELECT $1, tag_id FROM tcc_tags WHERE tcc_id = $2',
          [id, tccId],
        );
        await tx.query('UPDATE tccs SET views = views + 1 WHERE id = $1', [
          tccId,
        ]);
        return { counted: true };
      });
    },
  };
}
