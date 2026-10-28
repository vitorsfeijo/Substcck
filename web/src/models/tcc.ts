export interface NamedEntity {
  id: string;
  name: string;
}

export interface TagDTO extends NamedEntity {
  area: NamedEntity | null;
}

export interface AttachmentDTO {
  id: string;
  kind: 'image' | 'document';
  originalName: string;
  mimeType: string;
  size: number;
  description: string;
  format: 'PDF' | 'DOCX' | 'EPUB' | null;
  url: string;
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
  status: 'RASCUNHO' | 'PUBLICADO';
  tags: TagDTO[];
  collection: NamedEntity | null;
  media: { id: string; url: string; description: string }[];
  file: {
    id: string;
    originalName: string;
    format: 'PDF' | 'DOCX' | 'EPUB';
    path: string;
  } | null;
  views: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TccOptions {
  professors: NamedEntity[];
  tags: TagDTO[];
  areas: NamedEntity[];
  collections: NamedEntity[];
}

export interface TccPage {
  items: TccDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TccCommand {
  intent: 'publish' | 'draft';
  title: string;
  summary: string;
  year?: number;
  semester?: number;
  defendedAt?: string;
  advisorId?: string;
  coadvisorId?: string;
  lumeUrl: string;
  tagIds: string[];
  collectionId?: string;
  mediaIds: string[];
  mediaDescriptions: Record<string, string>;
  fileId: string | null;
}
