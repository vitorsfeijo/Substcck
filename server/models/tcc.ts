export type TccStatus = 'RASCUNHO' | 'PUBLICADO';
export type TccFileFormat = 'PDF' | 'DOCX' | 'EPUB';

export interface NamedEntity {
  id: string;
  name: string;
}

export interface TagDTO extends NamedEntity {
  area: NamedEntity | null;
}

export interface MediaDTO {
  id: string;
  url: string;
  description: string;
}

export interface FileDTO {
  id: string;
  originalName: string;
  format: TccFileFormat;
  path: string;
}

export interface TccDTO {
  id: string;
  title: string;
  summary: string | null;
  year: number | null;
  semester: number | null;
  defendedAt: string | null;
  author: NamedEntity;
  advisor: NamedEntity | null;
  coadvisor: NamedEntity | null;
  lumeUrl: string | null;
  status: TccStatus;
  tags: TagDTO[];
  collection: NamedEntity | null;
  media: MediaDTO[];
  file: FileDTO | null;
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal persistence command. HTTP publication is introduced in M2. */
export interface TccWriteInput {
  id?: string;
  title: string;
  summary?: string | null;
  year?: number | null;
  semester?: number | null;
  defendedAt?: string | null;
  advisorId?: string | null;
  coadvisorId?: string | null;
  lumeUrl?: string | null;
  status: TccStatus;
  tagIds?: string[];
  collectionId?: string | null;
  media?: MediaDTO[];
  file?: FileDTO | null;
}

export interface TccFilter {
  term?: string;
  year?: number;
  semester?: number;
  authorId?: string;
  advisorId?: string;
  tagIds?: string[];
  areaIds?: string[];
  collectionId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface TccPage {
  items: TccDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FeedDTO {
  recent: TccDTO[];
  trendingTags: { tag: TagDTO; views: number }[];
  periodDays: number;
}

export class TccAccessError extends Error {
  constructor() {
    super('Trabalho não encontrado ou acesso não permitido.');
    this.name = 'TccAccessError';
  }
}

export class TccValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super('Revise os campos informados.');
    this.name = 'TccValidationError';
  }
}
