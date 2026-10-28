import type { TccDTO } from './tcc.js';

export interface TccSubmission {
  intent: 'publish' | 'draft';
  title: string;
  summary?: string | null;
  year?: number | null;
  semester?: number | null;
  defendedAt?: string | null;
  advisorId?: string | null;
  coadvisorId?: string | null;
  lumeUrl?: string | null;
  tagIds?: string[];
  collectionId?: string | null;
  mediaIds?: string[];
  fileId?: string | null;
  mediaDescriptions?: Record<string, string>;
}

export interface PublicationResult {
  tcc: TccDTO;
  message: string;
}

export class LumePublicationError extends Error {
  constructor(public readonly canSaveDraft: boolean) {
    super(
      'A URL informada não pertence ao domínio do LUME ou está inacessível. Deseja salvar como rascunho até que a publicação no LUME esteja homologada?',
    );
  }
}

export class PublicationConflictError extends Error {
  constructor() {
    super(
      'Esta operação já foi concluída com outros dados. Consulte seus trabalhos antes de tentar novamente.',
    );
  }
}
