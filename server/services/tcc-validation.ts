import {
  TccValidationError,
  type TccFilter,
  type TccWriteInput,
} from '../models/tcc.js';

export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

function todayInBrazil() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function validateTccInput(
  input: TccWriteInput,
  today = todayInBrazil(),
): TccWriteInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TccValidationError({ input: 'Informe os dados do trabalho.' });
  }
  const errors: Record<string, string> = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const summary =
    typeof input.summary === 'string' ? input.summary.trim() : null;
  const lumeUrl =
    typeof input.lumeUrl === 'string' ? input.lumeUrl.trim() : null;
  const tags = input.tagIds ?? [];
  const media = input.media ?? [];
  const published = input.status === 'PUBLICADO';
  const year = input.year ?? null;
  const semester = input.semester ?? null;
  const defendedAt = input.defendedAt ?? null;

  for (const field of ['summary', 'lumeUrl'] as const) {
    if (
      input[field] !== undefined &&
      input[field] !== null &&
      typeof input[field] !== 'string'
    )
      errors[field] = 'Informe um texto válido.';
  }
  for (const field of [
    'id',
    'advisorId',
    'coadvisorId',
    'collectionId',
  ] as const) {
    const value = input[field];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || !value.trim() || value.length > 256)
    )
      errors[field] = 'Identificador inválido.';
  }

  if (!['RASCUNHO', 'PUBLICADO'].includes(input.status))
    errors.status = 'Estado inválido.';
  if (!title || title.length > 200)
    errors.title = 'Informe um título de até 200 caracteres.';
  if ((summary?.length ?? 0) > 5000 || (published && !summary))
    errors.summary = 'Informe um resumo de até 5.000 caracteres.';
  if (
    (year !== null &&
      (!Number.isInteger(year) ||
        year < 1900 ||
        year > Number(today.slice(0, 4)))) ||
    (published && year === null)
  )
    errors.year = 'Informe um ano válido, não futuro.';
  if (
    (semester !== null && semester !== 1 && semester !== 2) ||
    (published && semester === null)
  )
    errors.semester = 'Informe o semestre 1 ou 2.';
  if (
    (defendedAt !== null && (!validDate(defendedAt) || defendedAt > today)) ||
    (published && !defendedAt)
  ) {
    errors.defendedAt = 'Informe uma data de defesa válida, não futura.';
  } else if (defendedAt) {
    if (year !== null && Number(defendedAt.slice(0, 4)) !== year)
      errors.year = 'O ano deve corresponder à data de defesa.';
    if (
      semester !== null &&
      (Number(defendedAt.slice(5, 7)) <= 6 ? 1 : 2) !== semester
    )
      errors.semester = 'O semestre deve corresponder à data de defesa.';
  }
  if (published && !input.advisorId) errors.advisorId = 'Informe o orientador.';
  if (input.coadvisorId && input.coadvisorId === input.advisorId)
    errors.coadvisorId =
      'Orientador e coorientador devem ser pessoas diferentes.';
  if ((lumeUrl?.length ?? 0) > 2048 || (published && !lumeUrl))
    errors.lumeUrl = 'Informe o link do LUME, com até 2.048 caracteres.';
  if (
    !Array.isArray(tags) ||
    tags.length > 5 ||
    (published && tags.length === 0) ||
    tags.some((tag) => typeof tag !== 'string' || !tag.trim()) ||
    new Set(tags).size !== tags.length
  )
    errors.tagIds =
      'Escolha até 5 tags distintas; publicar exige ao menos uma.';
  if (
    !Array.isArray(media) ||
    media.length > 3 ||
    media.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.url !== 'string' ||
        !item.url.trim() ||
        item.url.length > 2048 ||
        typeof item.description !== 'string' ||
        item.description.length > 300,
    ) ||
    (Array.isArray(media) &&
      new Set(media.map((item) => item?.id)).size !== media.length)
  )
    errors.media = 'Anexe até 3 imagens com descrição de até 300 caracteres.';
  if (
    input.file &&
    (!input.file.id ||
      !['PDF', 'DOCX', 'EPUB'].includes(input.file.format) ||
      typeof input.file.originalName !== 'string' ||
      !input.file.originalName.trim() ||
      input.file.originalName.length > 255 ||
      typeof input.file.path !== 'string' ||
      !input.file.path.trim() ||
      input.file.path.length > 2048)
  )
    errors.file = 'Informe um único arquivo PDF, DOCX ou EPUB válido.';
  if (Object.keys(errors).length) throw new TccValidationError(errors);
  return {
    ...input,
    title,
    summary: summary || null,
    year,
    semester,
    defendedAt,
    lumeUrl: lumeUrl || null,
    advisorId: input.advisorId || null,
    coadvisorId: input.coadvisorId || null,
    collectionId: input.collectionId || null,
    tagIds: tags,
    media,
    file: input.file || null,
  };
}

export function validateTccFilter(
  filter: TccFilter = {},
): Required<Pick<TccFilter, 'page' | 'pageSize'>> & TccFilter {
  const errors: Record<string, string> = {};
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000)
    errors.page = 'Página inválida.';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    errors.pageSize = 'O tamanho de página deve estar entre 1 e 100.';
  if (
    filter.year !== undefined &&
    (!Number.isInteger(filter.year) || filter.year < 1900 || filter.year > 9999)
  )
    errors.year = 'Ano inválido.';
  if (filter.semester !== undefined && ![1, 2].includes(filter.semester))
    errors.semester = 'Semestre inválido.';
  if (
    filter.term !== undefined &&
    (typeof filter.term !== 'string' || filter.term.length > 200)
  )
    errors.term = 'O termo deve ter até 200 caracteres.';
  for (const key of ['dateFrom', 'dateTo'] as const) {
    if (filter[key] && !validDate(filter[key])) errors[key] = 'Data inválida.';
  }
  if (filter.dateFrom && filter.dateTo && filter.dateFrom > filter.dateTo)
    errors.dateTo = 'O fim do período deve ser posterior ao início.';
  for (const key of ['tagIds', 'areaIds'] as const) {
    const values = filter[key];
    if (
      values &&
      (!Array.isArray(values) ||
        values.length > 100 ||
        values.some((value) => typeof value !== 'string' || !value.trim()))
    )
      errors[key] = 'Lista de classificação inválida.';
  }
  if (Object.keys(errors).length) throw new TccValidationError(errors);
  return { ...filter, page, pageSize };
}
