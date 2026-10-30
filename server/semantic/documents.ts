import { createHash } from 'node:crypto';
import type { Database, SqlConnection } from '../data/database.js';
import { buildSemanticTerms, type SemanticSource } from './text.js';

export const semanticVersion = 'lsa-pt-v1';

interface SourceRow extends Record<string, unknown>, SemanticSource {
  id: string;
  updated_at: string | Date;
}

const sourceSql = `SELECT t.id, t.title, t.summary, t.updated_at::text AS updated_at, c.name AS collection,
  COALESCE((SELECT jsonb_agg(tag.name ORDER BY tag.id) FROM tcc_tags tt
    JOIN tags tag ON tag.id = tt.tag_id WHERE tt.tcc_id = t.id), '[]'::jsonb) AS tags,
  COALESCE((SELECT jsonb_agg(names.name ORDER BY names.name) FROM
    (SELECT DISTINCT area.name FROM tcc_tags tt JOIN tags tag ON tag.id = tt.tag_id
     JOIN areas area ON area.id = tag.area_id WHERE tt.tcc_id = t.id) names), '[]'::jsonb) AS areas
  FROM tccs t LEFT JOIN collections c ON c.id = t.collection_id
  WHERE t.status = 'PUBLICADO'`;

function indexSource(row: SourceRow) {
  const source: SemanticSource = {
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    areas: row.areas,
    collection: row.collection,
  };
  return {
    terms: buildSemanticTerms(source),
    hash: createHash('sha256')
      .update(JSON.stringify({ version: semanticVersion, source }))
      .digest('hex'),
  };
}

async function saveSource(tx: SqlConnection, row: SourceRow) {
  const indexed = indexSource(row);
  await tx.query(
    `INSERT INTO semantic_documents (tcc_id, terms, source_hash, source_updated_at, version)
     VALUES ($1, $2::jsonb, $3, $4, $5)
     ON CONFLICT (tcc_id) DO UPDATE SET terms = EXCLUDED.terms,
       source_hash = EXCLUDED.source_hash, source_updated_at = EXCLUDED.source_updated_at,
       version = EXCLUDED.version, indexed_at = CURRENT_TIMESTAMP`,
    [
      row.id,
      JSON.stringify(indexed.terms),
      indexed.hash,
      row.updated_at,
      semanticVersion,
    ],
  );
}

/** Called within the same transaction that changes a work and its classification. */
export async function updateSemanticDocument(tx: SqlConnection, id: string) {
  const result = await tx.query<SourceRow>(`${sourceSql} AND t.id = $1`, [id]);
  if (!result.rows[0]) {
    await tx.query('DELETE FROM semantic_documents WHERE tcc_id = $1', [id]);
    return;
  }
  await saveSource(tx, result.rows[0]);
}

export async function rebuildSemanticDocuments(db: Database) {
  return db.transaction(async (tx) => {
    // Serialize with publication/edit; never hold this lock across external calls.
    await tx.exec('LOCK TABLE tccs IN SHARE ROW EXCLUSIVE MODE');
    const rows = await tx.query<SourceRow>(
      `${sourceSql} ORDER BY t.id LIMIT 10001`,
    );
    if (rows.rows.length > 10000)
      throw new Error('A reconstrução exige um lote operacional menor.');
    await tx.query('DELETE FROM semantic_documents');
    for (const row of rows.rows) await saveSource(tx, row);
    return rows.rows.length;
  });
}

export async function ensureSemanticDocuments(db: Database) {
  const missing = await db.query(
    `SELECT t.id FROM tccs t LEFT JOIN semantic_documents d ON d.tcc_id = t.id
     WHERE t.status = 'PUBLICADO' AND (d.tcc_id IS NULL OR d.version <> $1
       OR d.source_updated_at <> t.updated_at) LIMIT 1`,
    [semanticVersion],
  );
  if (missing.rows.length) return rebuildSemanticDocuments(db);
  return 0;
}
