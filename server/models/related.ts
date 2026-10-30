import type { NamedEntity, TccDTO } from './tcc.js';

export interface RelatedWork {
  tcc: TccDTO;
  sharedTags: NamedEntity[];
  sharedAreas: NamedEntity[];
  score: number;
}

export interface RelatedWorks {
  items: RelatedWork[];
}
