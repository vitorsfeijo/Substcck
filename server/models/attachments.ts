import type { Readable } from 'node:stream';

export type AttachmentKind = 'image' | 'document';
export type AttachmentFormat = 'PDF' | 'DOCX' | 'EPUB';

export interface AttachmentDTO {
  id: string;
  kind: AttachmentKind;
  originalName: string;
  mimeType: string;
  size: number;
  description: string;
  format: AttachmentFormat | null;
  url: string;
}

export interface AttachmentRecord extends AttachmentDTO {
  authorId: string;
  storageKey: string;
  createdAt: string;
}

export interface AttachmentStore {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer | Readable; mimeType?: string }>;
  remove(key: string): Promise<void>;
}

export class AttachmentError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_ATTACHMENT'
      | 'ATTACHMENT_TOO_LARGE'
      | 'ATTACHMENT_NOT_FOUND'
      | 'ATTACHMENT_IN_USE'
      | 'STORAGE_UNAVAILABLE',
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AttachmentError';
  }
}
