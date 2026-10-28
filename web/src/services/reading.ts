import type { TccDTO } from '../models/tcc';

export class ReadingRequestError extends Error {
  constructor(public readonly status: number) {
    super('Não foi possível carregar o trabalho.');
    this.name = 'ReadingRequestError';
  }
}

export async function getPublishedWork(
  base: string,
  id: string,
  signal: AbortSignal,
): Promise<TccDTO> {
  const response = await fetch(`${base}/tccs/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (!response.ok) throw new ReadingRequestError(response.status);
  const work = (await response.json()) as TccDTO;
  if (work.status !== 'PUBLICADO') throw new ReadingRequestError(404);
  return work;
}

/** Counting exploration is independent from successfully rendering the reading. */
export async function recordPublicView(
  base: string,
  id: string,
  signal: AbortSignal,
) {
  const response = await fetch(`${base}/tccs/${encodeURIComponent(id)}/views`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
  if (!response.ok) throw new ReadingRequestError(response.status);
}

/** API metadata cannot direct readers or their credentials to another host. */
export function publicAttachmentUrl(base: string, path: string): string | null {
  if (!/^\/api\/attachments\/[A-Za-z0-9_-]{1,128}$/.test(path)) return null;
  return `${base}${path.slice('/api'.length)}`;
}

export function officialLumeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'lume.ufrgs.br' ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

const contentTypes = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  EPUB: 'application/epub+zip',
};

export async function downloadPublishedFile(
  base: string,
  file: NonNullable<TccDTO['file']>,
  signal: AbortSignal,
) {
  const url = publicAttachmentUrl(base, file.path);
  if (!url) throw new Error('Arquivo indisponível.');
  const response = await fetch(url, {
    credentials: 'include',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  const contentType = response.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  if (
    !response.ok ||
    contentType !== contentTypes[file.format] ||
    Number(response.headers.get('content-length')) > 25 * 1024 * 1024
  )
    throw new Error('Arquivo indisponível.');
  const blob = await response.blob();
  if (!blob.size || blob.size > 25 * 1024 * 1024)
    throw new Error('Arquivo indisponível.');
  const filename =
    Array.from(file.originalName.split(/[\\/]/).pop() || '')
      .filter((character) => {
        const code = character.codePointAt(0)!;
        return code >= 32 && code !== 127;
      })
      .join('')
      .slice(0, 255)
      .replace(/[\uD800-\uDBFF]$/, '')
      .trim() || `artigo.${file.format.toLowerCase()}`;
  return { blob, filename };
}
