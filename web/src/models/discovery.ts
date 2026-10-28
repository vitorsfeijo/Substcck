import type { NamedEntity, TagDTO, TccDTO } from './tcc';

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
