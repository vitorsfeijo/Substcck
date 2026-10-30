import type {
  DiscoveryOptions,
  FeedDTO,
  SearchFilters,
  SearchResults,
} from '../models/discovery';

export class DiscoveryRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DiscoveryRequestError';
  }
}

async function get<T>(
  base: string,
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (!response.ok) {
    throw new DiscoveryRequestError(
      response.status === 400
        ? 'Confira os critérios da pesquisa e tente novamente.'
        : 'Não foi possível carregar o acervo agora. Tente novamente.',
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

export function getFeed(base: string, signal: AbortSignal) {
  return get<FeedDTO>(base, '/feed', signal);
}

export function getDiscoveryOptions(base: string, signal: AbortSignal) {
  return get<DiscoveryOptions>(base, '/discovery-options', signal);
}

export function readSearchFilters(query: string): SearchFilters {
  const params = new URLSearchParams(query);
  const list = (name: string) => [
    ...new Set(
      (params.get(name) || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return {
    mode: params.get('mode') === 'semantic' ? 'semantic' : 'text',
    term: params.get('term') || '',
    year: params.get('year') || '',
    semester: params.get('semester') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    authorId: params.get('authorId') || '',
    advisorId: params.get('advisorId') || '',
    tagIds: list('tagIds'),
    areaIds: list('areaIds'),
    collectionId: params.get('collectionId') || '',
  };
}

export function readSearchPage(query: string) {
  const value = Number(new URLSearchParams(query).get('page') || 1);
  return Number.isInteger(value) && value > 0 && value <= 1_000_000 ? value : 1;
}

export function readSearchPageSize(query: string) {
  const value = Number(new URLSearchParams(query).get('pageSize') || 12);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 12;
}

export function buildSearchQuery(
  filters: SearchFilters,
  page = 1,
  pageSize?: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'mode' && value === 'text') continue;
    const readable = Array.isArray(value) ? value.join(',') : value.trim();
    if (readable) params.set(key, readable);
  }
  if (page > 1) params.set('page', String(page));
  if (pageSize !== undefined) params.set('pageSize', String(pageSize));
  return params.toString();
}

export function searchHref(
  filters: SearchFilters,
  page = 1,
  pageSize?: number,
) {
  const query = buildSearchQuery(filters, page, pageSize);
  return `#/buscar${query ? `?${query}` : ''}`;
}

export function getSearchResults(
  base: string,
  query: string,
  signal: AbortSignal,
) {
  const params = new URLSearchParams(
    buildSearchQuery(readSearchFilters(query), readSearchPage(query)),
  );
  params.set('pageSize', String(readSearchPageSize(query)));
  const endpoint =
    readSearchFilters(query).mode === 'semantic' ? '/search' : '/tccs';
  return get<SearchResults>(base, `${endpoint}?${params.toString()}`, signal);
}

/** API attachments keep their origin; a DTO cannot make the catalog load arbitrary URLs. */
export function publicImageUrl(base: string | null, path: string) {
  if (!base) return null;
  try {
    const api = new URL(base, window.location.href);
    const image = new URL(path, `${api.href}/`);
    return image.origin === api.origin &&
      ['https:', 'http:'].includes(image.protocol)
      ? image.href
      : null;
  } catch {
    return null;
  }
}
