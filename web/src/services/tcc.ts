import type {
  AttachmentDTO,
  TagDTO,
  TccCommand,
  TccDTO,
  TccOptions,
  TccPage,
} from '../models/tcc';

export class EditorRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields: Record<string, string> = {},
    public readonly canSaveDraft = false,
  ) {
    super(message);
    this.name = 'EditorRequestError';
  }
}

async function json<T>(
  base: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    signal: options.signal || AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', ...options.headers },
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new EditorRequestError(
      'O serviço não respondeu como esperado. Tente novamente.',
      response.status,
    );
  }
  if (!response.ok) {
    const error =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    const fields: Record<string, string> = {};
    if (error.fields && typeof error.fields === 'object') {
      for (const [key, message] of Object.entries(error.fields)) {
        if (typeof message === 'string') fields[key] = message;
      }
    }
    throw new EditorRequestError(
      typeof error.message === 'string'
        ? error.message
        : 'Não foi possível concluir a operação. Tente novamente.',
      response.status,
      typeof error.code === 'string' ? error.code : undefined,
      fields,
      error.canSaveDraft === true,
    );
  }
  return value as T;
}

export function getTccOptions(base: string, signal: AbortSignal) {
  return json<TccOptions>(base, '/tcc-options', { signal });
}

export function getOwnWorks(base: string, signal: AbortSignal, page = 1) {
  return json<TccPage>(base, `/me/tccs?page=${page}&pageSize=20`, { signal });
}

export function getOwnWork(base: string, id: string, signal: AbortSignal) {
  return json<TccDTO>(base, `/me/tccs/${encodeURIComponent(id)}`, { signal });
}

export function saveTcc(
  base: string,
  csrfToken: string,
  command: TccCommand,
  id?: string,
  idempotencyKey?: string,
  signal?: AbortSignal,
) {
  return json<{ tcc: TccDTO; message: string }>(
    base,
    id ? `/tccs/${encodeURIComponent(id)}` : '/tccs',
    {
      method: id ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(!id && idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(command),
      ...(signal
        ? { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
        : {}),
    },
  );
}

export function createTag(
  base: string,
  csrfToken: string,
  name: string,
  areaId?: string,
  signal?: AbortSignal,
) {
  return json<TagDTO>(base, '/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ name, ...(areaId ? { areaId } : {}) }),
    ...(signal
      ? { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }
      : {}),
  });
}

export function uploadAttachment(
  base: string,
  csrfToken: string,
  file: File,
  kind: 'image' | 'document',
  signal?: AbortSignal,
) {
  const body = new FormData();
  body.append('file', file);
  return json<AttachmentDTO>(base, `/attachments?kind=${kind}`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
  });
}

export async function getPrivateImage(
  base: string,
  id: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    `${base}/attachments/${encodeURIComponent(id)}`,
    {
      credentials: 'include',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    },
  );
  if (!response.ok) throw new Error('Prévia indisponível.');
  return response.blob();
}

export async function discardAttachment(
  base: string,
  csrfToken: string,
  id: string,
) {
  const response = await fetch(
    `${base}/attachments/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      credentials: 'include',
      signal: AbortSignal.timeout(15_000),
      headers: { 'X-CSRF-Token': csrfToken },
    },
  );
  // Referenced attachments remain protected; removing the form selection must not delete them.
  if (!response.ok && response.status !== 409 && response.status !== 404)
    throw new Error('Não foi possível remover o envio.');
}
