import { randomUUID } from 'node:crypto';
import type { SqlConnection } from '../data/database.js';
import type { User, VerifiedIdentity } from '../models/auth.js';

interface UserRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  institutional_login: string;
  role: User['role'];
  enrollment: string | null;
  department: string | null;
}

const publicColumns =
  'id, name, email, institutional_login, role, enrollment, department';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    institutionalLogin: row.institutional_login,
    role: row.role,
    enrollment: row.enrollment,
    department: row.department,
  };
}

function validateIdentity(identity: VerifiedIdentity) {
  for (const key of [
    'issuer',
    'subject',
    'name',
    'email',
    'institutionalLogin',
  ] as const) {
    if (typeof identity[key] !== 'string' || !identity[key].trim()) {
      throw new Error('Identidade institucional incompleta.');
    }
  }
  if (!['student', 'professor'].includes(identity.role)) {
    throw new Error('Vínculo institucional não autorizado.');
  }
  if (identity.role === 'student' && !identity.enrollment?.trim()) {
    throw new Error('Vínculo de aluno sem matrícula verificada.');
  }
  if (identity.role === 'professor' && !identity.department?.trim()) {
    throw new Error('Vínculo de professor sem departamento verificado.');
  }
}

export function createIdentityRepository(db: SqlConnection) {
  return {
    async upsert(identity: VerifiedIdentity): Promise<User> {
      validateIdentity(identity);
      const result = await db.query<UserRow>(
        `INSERT INTO users (id, issuer, subject, name, email, institutional_login, role, enrollment, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (issuer, subject) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           institutional_login = EXCLUDED.institutional_login,
           role = EXCLUDED.role,
           enrollment = EXCLUDED.enrollment,
           department = EXCLUDED.department,
           updated_at = CURRENT_TIMESTAMP
         RETURNING ${publicColumns}`,
        [
          randomUUID(),
          identity.issuer,
          identity.subject,
          identity.name.trim(),
          identity.email.trim(),
          identity.institutionalLogin.trim(),
          identity.role,
          identity.enrollment?.trim() || null,
          identity.department?.trim() || null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Não foi possível persistir a identidade.');
      return toUser(row);
    },
    async findById(id: string): Promise<User | null> {
      const result = await db.query<UserRow>(
        `SELECT ${publicColumns} FROM users WHERE id = $1`,
        [id],
      );
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
  };
}

export type IdentityRepository = ReturnType<typeof createIdentityRepository>;
