import { randomUUID } from 'node:crypto';
import type { Database, SqlConnection } from '../data/database.js';
import {
  TccAccessError,
  TccValidationError,
  type FileDTO,
  type MediaDTO,
  type NamedEntity,
  type TagDTO,
  type TccDTO,
  type TccFilter,
  type TccPage,
  type TccStatus,
  type TccWriteInput,
} from '../models/tcc.js';
import {
  normalizeSearch,
  validateTccFilter,
  validateTccInput,
} from '../services/tcc-validation.js';

interface TccRow extends Record<string, unknown> {
  id: string;
  title: string;
  summary: string | null;
  year: number | null;
  semester: number | null;
  defended_at: string | Date | null;
  author_id: string;
  author_name: string;
  advisor_id: string | null;
  advisor_name: string | null;
  coadvisor_id: string | null;
  coadvisor_name: string | null;
  lume_url: string | null;
  status: TccStatus;
  tags: TagDTO[];
  collection: NamedEntity | null;
  media: MediaDTO[];
  file: FileDTO | null;
  views: number;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const joins = `FROM tccs t
  JOIN users author ON author.id = t.author_id
  LEFT JOIN users advisor ON advisor.id = t.advisor_id
  LEFT JOIN users coadvisor ON coadvisor.id = t.coadvisor_id
  LEFT JOIN collections collection ON collection.id = t.collection_id`;

const columns = `SELECT t.*, author.name AS author_name, advisor.name AS advisor_name,
  coadvisor.name AS coadvisor_name,
  CASE WHEN collection.id IS NULL THEN NULL ELSE jsonb_build_object('id', collection.id, 'name', collection.name) END AS collection,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name,
    'area', CASE WHEN area.id IS NULL THEN NULL ELSE jsonb_build_object('id', area.id, 'name', area.name) END) ORDER BY tag.name, tag.id)
    FROM tcc_tags tt JOIN tags tag ON tag.id = tt.tag_id LEFT JOIN areas area ON area.id = tag.area_id WHERE tt.tcc_id = t.id), '[]'::jsonb) AS tags,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'url', m.url, 'description', m.description) ORDER BY m.position)
    FROM tcc_media m WHERE m.tcc_id = t.id), '[]'::jsonb) AS media,
  (SELECT jsonb_build_object('id', f.id, 'originalName', f.original_name, 'format', f.format, 'path', f.path)
    FROM tcc_files f WHERE f.tcc_id = t.id) AS file`;

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

function toDTO(row: TccRow): TccDTO {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    year: row.year,
    semester: row.semester,
    defendedAt: row.defended_at ? iso(row.defended_at).slice(0, 10) : null,
    author: { id: row.author_id, name: row.author_name },
    advisor: row.advisor_id
      ? { id: row.advisor_id, name: row.advisor_name! }
      : null,
    coadvisor: row.coadvisor_id
      ? { id: row.coadvisor_id, name: row.coadvisor_name! }
      : null,
    lumeUrl: row.lume_url,
    status: row.status,
    tags: row.tags,
    collection: row.collection,
    media: row.media,
    file: row.file,
    views: row.views,
    publishedAt: row.published_at ? iso(row.published_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function find(
  connection: SqlConnection,
  id: string,
  ownerId?: string,
): Promise<TccDTO | null> {
  const scope = ownerId ? 't.author_id = $2' : "t.status = 'PUBLICADO'";
  const result = await connection.query<TccRow>(
    `${columns} ${joins} WHERE t.id = $1 AND ${scope}`,
    ownerId ? [id, ownerId] : [id],
  );
  return result.rows[0] ? toDTO(result.rows[0]) : null;
}

function selection(filter: TccFilter, ownerId?: string) {
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const conditions = [
    ownerId ? `t.author_id = ${bind(ownerId)}` : "t.status = 'PUBLICADO'",
  ];
  if (filter.term?.trim()) {
    const searchable = `concat_ws(' ', t.title, t.summary, author.name, advisor.name)`;
    const normalized = `translate(lower(${searchable}), 'áàäâãéèëêíìïîóòöôõúùüûçñ', 'aaaaaeeeeiiiiooooouuuucn')`;
    conditions.push(
      `strpos(${normalized}, ${bind(normalizeSearch(filter.term))}) > 0`,
    );
  }
  for (const [key, column] of [
    ['year', 't.year'],
    ['semester', 't.semester'],
    ['authorId', 't.author_id'],
    ['advisorId', 't.advisor_id'],
    ['collectionId', 't.collection_id'],
  ] as const) {
    if (filter[key] !== undefined)
      conditions.push(`${column} = ${bind(filter[key])}`);
  }
  if (filter.dateFrom)
    conditions.push(`t.defended_at >= ${bind(filter.dateFrom)}::date`);
  if (filter.dateTo)
    conditions.push(`t.defended_at <= ${bind(filter.dateTo)}::date`);
  if (filter.tagIds?.length) {
    const tags = [...new Set(filter.tagIds)];
    conditions.push(
      `(SELECT count(*) FROM tcc_tags selected_tag WHERE selected_tag.tcc_id = t.id AND selected_tag.tag_id = ANY(${bind(tags)}::text[])) = ${bind(tags.length)}`,
    );
  }
  if (filter.areaIds?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM tcc_tags selected_tag JOIN tags selected_area ON selected_area.id = selected_tag.tag_id WHERE selected_tag.tcc_id = t.id AND selected_area.area_id = ANY(${bind([...new Set(filter.areaIds)])}::text[]))`,
    );
  }
  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

export function createTccRepository(db: Database) {
  async function list(
    filter: TccFilter = {},
    ownerId?: string,
  ): Promise<TccPage> {
    const parsed = validateTccFilter(filter);
    const { where, params } = selection(parsed, ownerId);
    const total = await db.query<{ count: string | number }>(
      `SELECT count(*) AS count ${joins} ${where}`,
      params,
    );
    const ordering = ownerId
      ? 't.updated_at DESC, t.id'
      : 't.defended_at DESC NULLS LAST, t.published_at DESC NULLS LAST, t.id';
    const result = await db.query<TccRow>(
      `${columns} ${joins} ${where} ORDER BY ${ordering} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parsed.pageSize, (parsed.page - 1) * parsed.pageSize],
    );
    return {
      items: result.rows.map(toDTO),
      total: Number(total.rows[0]?.count ?? 0),
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  return {
    findPublicById: (id: string) => find(db, id),
    listPublic: (filter: TccFilter = {}) => list(filter),
    async findOwnedById(id: string, authorId: string) {
      if (!authorId.trim()) throw new TccAccessError();
      return find(db, id, authorId);
    },
    async listOwned(authorId: string, filter: TccFilter = {}) {
      if (!authorId.trim()) throw new TccAccessError();
      return list(filter, authorId);
    },
    async listTags(): Promise<TagDTO[]> {
      const result = await db.query<{
        id: string;
        name: string;
        area: NamedEntity | null;
      }>(
        `SELECT tag.id, tag.name, CASE WHEN area.id IS NULL THEN NULL ELSE jsonb_build_object('id', area.id, 'name', area.name) END AS area FROM tags tag LEFT JOIN areas area ON area.id = tag.area_id ORDER BY tag.name, tag.id`,
      );
      return result.rows;
    },
    async listAreas(): Promise<NamedEntity[]> {
      return (
        await db.query<{ id: string; name: string }>(
          'SELECT id, name FROM areas ORDER BY name, id',
        )
      ).rows;
    },
    async listCollections(): Promise<NamedEntity[]> {
      return (
        await db.query<{ id: string; name: string }>(
          'SELECT id, name FROM collections ORDER BY name, id',
        )
      ).rows;
    },
    async ensureTag(name: string, areaId?: string): Promise<TagDTO> {
      const readable = name.trim().replace(/\s+/g, ' ');
      if (!readable || readable.length > 50)
        throw new TccValidationError({
          tag: 'A tag deve ter de 1 a 50 caracteres.',
        });
      const normalized = readable.toLocaleLowerCase('pt-BR');
      await db.query(
        'INSERT INTO tags (id, name, normalized_name, area_id) VALUES ($1, $2, $3, $4) ON CONFLICT (normalized_name) DO NOTHING',
        [randomUUID(), readable, normalized, areaId || null],
      );
      const result = await db.query<{
        id: string;
        name: string;
        area: NamedEntity | null;
      }>(
        `SELECT tag.id, tag.name, CASE WHEN area.id IS NULL THEN NULL ELSE jsonb_build_object('id', area.id, 'name', area.name) END AS area FROM tags tag LEFT JOIN areas area ON area.id = tag.area_id WHERE tag.normalized_name = $1`,
        [normalized],
      );
      if (!result.rows[0]) throw new Error('Não foi possível persistir a tag.');
      return result.rows[0];
    },
    async save(input: TccWriteInput, authorId: string): Promise<TccDTO> {
      const data = validateTccInput(input);
      const id = data.id || randomUUID();
      return db.transaction(async (tx) => {
        const author = await tx.query(
          'SELECT id FROM users WHERE id = $1 AND role = $2',
          [authorId, 'student'],
        );
        if (!author.rows[0]) throw new TccAccessError();
        if (data.id) {
          const existing = await tx.query<{
            author_id: string;
            status: TccStatus;
          }>('SELECT author_id, status FROM tccs WHERE id = $1 FOR UPDATE', [
            id,
          ]);
          if (!existing.rows[0] || existing.rows[0].author_id !== authorId)
            throw new TccAccessError();
          if (
            existing.rows[0].status === 'PUBLICADO' &&
            data.status === 'RASCUNHO'
          )
            throw new TccValidationError({
              status: 'Uma edição não pode despublicar o trabalho existente.',
            });
        }
        for (const key of ['advisorId', 'coadvisorId'] as const) {
          if (data[key]) {
            const professor = await tx.query(
              'SELECT id FROM users WHERE id = $1 AND role = $2',
              [data[key], 'professor'],
            );
            if (!professor.rows[0])
              throw new TccValidationError({
                [key]: 'Selecione um professor existente.',
              });
          }
        }
        if (data.collectionId) {
          const collection = await tx.query(
            'SELECT id FROM collections WHERE id = $1',
            [data.collectionId],
          );
          if (!collection.rows[0])
            throw new TccValidationError({
              collectionId: 'Selecione uma coleção existente.',
            });
        }
        if (data.tagIds?.length) {
          const tags = await tx.query(
            'SELECT id FROM tags WHERE id = ANY($1::text[])',
            [data.tagIds],
          );
          if (tags.rows.length !== data.tagIds.length)
            throw new TccValidationError({
              tagIds: 'Selecione tags existentes.',
            });
        }
        await tx.query(
          `INSERT INTO tccs (id, title, summary, year, semester, defended_at, author_id, advisor_id, coadvisor_id, lume_url, status, collection_id, published_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $11 = 'PUBLICADO' THEN CURRENT_TIMESTAMP ELSE NULL END)
          ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, year = EXCLUDED.year,
          semester = EXCLUDED.semester, defended_at = EXCLUDED.defended_at, advisor_id = EXCLUDED.advisor_id,
          coadvisor_id = EXCLUDED.coadvisor_id, lume_url = EXCLUDED.lume_url, status = EXCLUDED.status,
          collection_id = EXCLUDED.collection_id, published_at = COALESCE(tccs.published_at, EXCLUDED.published_at), updated_at = CURRENT_TIMESTAMP`,
          [
            id,
            data.title,
            data.summary,
            data.year,
            data.semester,
            data.defendedAt,
            authorId,
            data.advisorId,
            data.coadvisorId,
            data.lumeUrl,
            data.status,
            data.collectionId,
          ],
        );
        await tx.query('DELETE FROM tcc_tags WHERE tcc_id = $1', [id]);
        for (const tagId of data.tagIds ?? [])
          await tx.query(
            'INSERT INTO tcc_tags (tcc_id, tag_id) VALUES ($1, $2)',
            [id, tagId],
          );
        await tx.query('DELETE FROM tcc_media WHERE tcc_id = $1', [id]);
        for (const [position, media] of (data.media ?? []).entries()) {
          await tx.query(
            'INSERT INTO tcc_media (id, tcc_id, url, description, position) VALUES ($1,$2,$3,$4,$5)',
            [media.id, id, media.url, media.description, position],
          );
        }
        await tx.query('DELETE FROM tcc_files WHERE tcc_id = $1', [id]);
        if (data.file)
          await tx.query(
            'INSERT INTO tcc_files (id, tcc_id, original_name, format, path) VALUES ($1,$2,$3,$4,$5)',
            [
              data.file.id,
              id,
              data.file.originalName,
              data.file.format,
              data.file.path,
            ],
          );
        const result = await find(tx, id, authorId);
        if (!result)
          throw new Error('Não foi possível recuperar o trabalho salvo.');
        return result;
      });
    },
  };
}

export type TccRepository = ReturnType<typeof createTccRepository>;
