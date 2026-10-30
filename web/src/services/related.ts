import type { NamedEntity, TccDTO } from '../models/tcc';

export interface RelatedWork {
  tcc: TccDTO;
  sharedTags: NamedEntity[];
  sharedAreas: NamedEntity[];
  score: number;
}

function namedList(value: unknown): value is NamedEntity[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item && typeof item.id === 'string' && typeof item.name === 'string',
    )
  );
}

function validWork(value: RelatedWork) {
  const work = value?.tcc;
  return (
    work &&
    typeof work.id === 'string' &&
    typeof work.title === 'string' &&
    typeof work.author?.name === 'string' &&
    (work.advisor === null || typeof work.advisor?.name === 'string') &&
    (work.year === null || typeof work.year === 'number') &&
    (work.summary === null || typeof work.summary === 'string') &&
    namedList(work.tags) &&
    Array.isArray(work.media) &&
    work.media.every(
      (image) =>
        image &&
        typeof image.url === 'string' &&
        typeof image.description === 'string',
    ) &&
    namedList(value.sharedTags) &&
    namedList(value.sharedAreas)
  );
}

export async function getRelatedWorks(
  base: string,
  workId: string,
  signal: AbortSignal,
): Promise<RelatedWork[]> {
  const response = await fetch(
    `${base}/tccs/${encodeURIComponent(workId)}/related`,
    {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    },
  );
  if (!response.ok)
    throw new Error('Não foi possível carregar os trabalhos conexos.');
  const result = (await response.json()) as { items?: RelatedWork[] };
  if (!Array.isArray(result.items))
    throw new Error('Resposta de conexões inválida.');
  if (!result.items.every(validWork))
    throw new Error('Resposta de conexões inválida.');
  return result.items
    .filter(
      (item) => item.tcc?.status === 'PUBLICADO' && item.tcc.id !== workId,
    )
    .slice(0, 4);
}
