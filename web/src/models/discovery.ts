import type { NamedEntity, TagDTO, TccDTO, TccPage } from './tcc';

export interface FeedDTO {
  recent: TccDTO[];
  topics: (TagDTO & { views: number })[];
  windowDays: number;
}

export interface DiscoveryOptions {
  authors: NamedEntity[];
  advisors: NamedEntity[];
  years: number[];
  tags: TagDTO[];
  areas: NamedEntity[];
  collections: NamedEntity[];
}

export interface SearchFilters {
  mode: 'text' | 'semantic';
  term: string;
  year: string;
  semester: string;
  dateFrom: string;
  dateTo: string;
  authorId: string;
  advisorId: string;
  tagIds: string[];
  areaIds: string[];
  collectionId: string;
}

export interface SemanticSearchMetadata {
  requestedMode: 'semantic';
  mode: 'semantic' | 'text';
  fallbackReason:
    | null
    | 'insufficient_corpus'
    | 'query_out_of_vocabulary'
    | 'index_unavailable'
    | 'corpus_limit';
  notice?: string;
}

export interface SearchResults extends TccPage {
  search?: SemanticSearchMetadata;
}
