import type { SqlConnection } from '../data/database.js';
import type { AttachmentDTO, AttachmentRecord } from '../models/attachments.js';

interface AttachmentRow extends Record<string, unknown> {
  id: string;
  author_id: string;
  kind: AttachmentRecord['kind'];
  original_name: string;
  mime_type: string;
  size: number;
  storage_key: string;
  description: string;
  format: AttachmentRecord['format'];
  created_at: Date | string;
}

function fromRow(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    authorId: row.author_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    storageKey: row.storage_key,
    description: row.description,
    format: row.format,
    createdAt: new Date(row.created_at).toISOString(),
    url: `/api/attachments/${row.id}`,
  };
}

export function getAttachmentDTO(record: AttachmentRecord): AttachmentDTO {
  return {
    id: record.id,
    kind: record.kind,
    originalName: record.originalName,
    mimeType: record.mimeType,
    size: record.size,
    description: record.description,
    format: record.format,
    url: record.url,
  };
}

export const attachmentReferencesSql = `(
  EXISTS (SELECT 1 FROM tcc_media media WHERE media.id = a.id)
  OR EXISTS (SELECT 1 FROM tcc_files document WHERE document.id = a.id)
)`;

export function createAttachmentRepository(db: SqlConnection) {
  return {
    async insert(record: AttachmentRecord) {
      await db.query(
        `INSERT INTO attachments
        (id,author_id,kind,original_name,mime_type,size,storage_key,description,format)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          record.id,
          record.authorId,
          record.kind,
          record.originalName,
          record.mimeType,
          record.size,
          record.storageKey,
          record.description,
          record.format,
        ],
      );
    },
    async findById(id: string, lock = false): Promise<AttachmentRecord | null> {
      const result = await db.query<AttachmentRow>(
        `SELECT * FROM attachments WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
        [id],
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },
    async findOwned(
      id: string,
      authorId: string,
      lock = false,
    ): Promise<AttachmentRecord | null> {
      const result = await db.query<AttachmentRow>(
        `SELECT * FROM attachments WHERE id = $1 AND author_id = $2${lock ? ' FOR UPDATE' : ''}`,
        [id, authorId],
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },
    async findReadable(
      id: string,
      authorId?: string,
    ): Promise<AttachmentRecord | null> {
      const result = await db.query<AttachmentRow>(
        `SELECT a.* FROM attachments a WHERE a.id = $1 AND (
        a.author_id = $2 OR
        (a.kind = 'image' AND EXISTS (SELECT 1 FROM tcc_media media JOIN tccs work ON work.id = media.tcc_id WHERE media.id = a.id AND work.status = 'PUBLICADO')) OR
        (a.kind = 'document' AND EXISTS (SELECT 1 FROM tcc_files document JOIN tccs work ON work.id = document.tcc_id WHERE document.id = a.id AND work.status = 'PUBLICADO'))
      )`,
        [id, authorId || null],
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },
    async referencedByTcc(id: string): Promise<boolean> {
      const result = await db.query<{ referenced: boolean }>(
        `SELECT ${attachmentReferencesSql} AS referenced FROM attachments a WHERE a.id = $1`,
        [id],
      );
      return result.rows[0]?.referenced === true;
    },
    async remove(id: string) {
      await db.query('DELETE FROM attachments WHERE id = $1', [id]);
    },
    async listOrphans(before: Date): Promise<AttachmentRecord[]> {
      const result = await db.query<AttachmentRow>(
        `SELECT a.* FROM attachments a WHERE a.created_at < $1 AND NOT ${attachmentReferencesSql} ORDER BY a.created_at LIMIT 500`,
        [before.toISOString()],
      );
      return result.rows.map(fromRow);
    },
  };
}
