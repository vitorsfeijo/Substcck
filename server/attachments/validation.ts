import sharp from 'sharp';
import { inflateRawSync, crc32 } from 'node:zlib';
import {
  AttachmentError,
  type AttachmentFormat,
  type AttachmentKind,
} from '../models/attachments.js';

export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const DOCUMENT_LIMIT = 25 * 1024 * 1024;
const ZIP_TOTAL_LIMIT = 100 * 1024 * 1024;
const fail = (
  message = 'O conteúdo do arquivo não corresponde a um formato permitido.',
) => new AttachmentError('INVALID_ATTACHMENT', message, 400);

function cleanArchivePath(value: string) {
  return (
    !!value &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.split('/').some((part) => part === '.' || part === '..') &&
    !/^[A-Za-z]:/.test(value)
  );
}

/** Read only bounded, ordinary ZIP packages; no files are extracted to disk. */
function packageEntries(data: Buffer): Map<string, Buffer> {
  let end = data.length - 22;
  while (
    end >= Math.max(0, data.length - 65557) &&
    data.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  if (
    end < 0 ||
    data.length - end > 65557 ||
    data.readUInt32LE(end) !== 0x06054b50
  )
    throw fail();
  const count = data.readUInt16LE(end + 10);
  const offset = data.readUInt32LE(end + 16);
  const centralSize = data.readUInt32LE(end + 12);
  if (
    !count ||
    count > 1000 ||
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    data.readUInt16LE(end + 8) !== count ||
    offset === 0xffffffff ||
    centralSize === 0xffffffff ||
    offset + centralSize !== end ||
    end + 22 + data.readUInt16LE(end + 20) !== data.length
  )
    throw fail(
      'Estrutura ZIP não suportada ou limites do documento excedidos.',
    );
  const entries = new Map<string, Buffer>();
  let cursor = offset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50)
      throw fail();
    const flags = data.readUInt16LE(cursor + 8);
    const compression = data.readUInt16LE(cursor + 10);
    const checksum = data.readUInt32LE(cursor + 16);
    const size = data.readUInt32LE(cursor + 20);
    const originalSize = data.readUInt32LE(cursor + 24);
    const nameSize = data.readUInt16LE(cursor + 28);
    const extraSize = data.readUInt16LE(cursor + 30);
    const commentSize = data.readUInt16LE(cursor + 32);
    const localOffset = data.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (
      next > end ||
      !nameSize ||
      flags & 0x41 ||
      ![0, 8].includes(compression) ||
      originalSize > DOCUMENT_LIMIT ||
      (total += originalSize) > ZIP_TOTAL_LIMIT ||
      localOffset === 0xffffffff
    )
      throw fail('Documento compactado excede os limites permitidos.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      data.subarray(cursor + 46, cursor + 46 + nameSize),
    );
    if (!cleanArchivePath(name) || entries.has(name))
      throw fail('Documento compactado contém nomes inválidos ou repetidos.');
    let extra = cursor + 46 + nameSize;
    while (extra < cursor + 46 + nameSize + extraSize) {
      if (extra + 4 > next) throw fail();
      if (data.readUInt16LE(extra) === 1) throw fail('ZIP64 não é suportado.');
      extra += 4 + data.readUInt16LE(extra + 2);
    }
    if (
      extra !== cursor + 46 + nameSize + extraSize ||
      localOffset + 30 > offset ||
      data.readUInt32LE(localOffset) !== 0x04034b50
    )
      throw fail();
    const localNameSize = data.readUInt16LE(localOffset + 26);
    const localExtraSize = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameSize + localExtraSize;
    const localName = new TextDecoder('utf-8', { fatal: true }).decode(
      data.subarray(localOffset + 30, localOffset + 30 + localNameSize),
    );
    if (
      localName !== name ||
      data.readUInt16LE(localOffset + 8) !== compression ||
      data.readUInt16LE(localOffset + 6) !== flags ||
      start + size > offset
    )
      throw fail();
    const compressed = data.subarray(start, start + size);
    const content =
      compression === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, {
            maxOutputLength: Math.min(originalSize + 1, DOCUMENT_LIMIT + 1),
          });
    if (content.length !== originalSize || crc32(content) !== checksum)
      throw fail('Integridade do documento compactado inválida.');
    entries.set(name, content);
    cursor = next;
  }
  if (cursor !== end) throw fail();
  return entries;
}

function xml(data: Buffer | undefined): string {
  if (!data?.length) throw fail();
  let value: string;
  if (data[0] === 0xff && data[1] === 0xfe)
    value = new TextDecoder('utf-16le', { fatal: true }).decode(data);
  else if (data[0] === 0xfe && data[1] === 0xff)
    value = new TextDecoder('utf-16be', { fatal: true }).decode(data);
  else value = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(value))
    throw fail('Declarações externas não são permitidas no documento.');
  return value;
}

function documentFormat(data: Buffer): {
  mimeType: string;
  format: AttachmentFormat;
} {
  if (
    /^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(
      data.subarray(0, 16).toString('latin1'),
    )
  ) {
    if (
      !/%%EOF\s*$/.test(
        data.subarray(Math.max(0, data.length - 1024)).toString('latin1'),
      ) ||
      !/\b\d+\s+\d+\s+obj\b/.test(data.toString('latin1'))
    )
      throw fail('O arquivo PDF está incompleto ou inválido.');
    return { mimeType: 'application/pdf', format: 'PDF' };
  }
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) throw fail();
  const entries = packageEntries(data);
  if (entries.has('[Content_Types].xml') && entries.has('word/document.xml')) {
    const types = xml(entries.get('[Content_Types].xml'));
    const document = xml(entries.get('word/document.xml'));
    if (
      entries.has('mimetype') ||
      !/<(?:\w+:)?Types\b/.test(types) ||
      !/wordprocessingml\.document\.main\+xml/.test(types) ||
      !/<(?:\w+:)?document\b/.test(document) ||
      !/<(?:\w+:)?body\b/.test(document) ||
      !/<\/(?:\w+:)?document\s*>/.test(document)
    )
      throw fail('O arquivo DOCX não contém a estrutura esperada.');
    return {
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      format: 'DOCX',
    };
  }
  if (entries.get('mimetype')?.toString('utf8') === 'application/epub+zip') {
    const container = xml(entries.get('META-INF/container.xml'));
    const path =
      /<(?:\w+:)?rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/.exec(
        container,
      )?.[1];
    if (
      !path ||
      !cleanArchivePath(path) ||
      !/urn:oasis:names:tc:opendocument:xmlns:container/.test(container)
    )
      throw fail('O arquivo EPUB não contém o pacote esperado.');
    const content = xml(entries.get(path));
    if (
      !/<(?:\w+:)?package\b/.test(content) ||
      !/<(?:\w+:)?manifest\b/.test(content) ||
      !/<(?:\w+:)?spine\b/.test(content) ||
      !/<\/(?:\w+:)?package\s*>/.test(content)
    )
      throw fail('O arquivo EPUB não contém o pacote esperado.');
    return { mimeType: 'application/epub+zip', format: 'EPUB' };
  }
  throw fail('O arquivo deve ser PDF, DOCX ou EPUB válido.');
}

export async function validateAttachmentContent(
  kind: AttachmentKind,
  data: Buffer,
) {
  const limit = kind === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT;
  if (!data.length) throw fail('O arquivo está vazio.');
  if (data.length > limit)
    throw new AttachmentError(
      'ATTACHMENT_TOO_LARGE',
      kind === 'image'
        ? 'Cada imagem deve ter até 5 MiB.'
        : 'O arquivo do trabalho deve ter até 25 MiB.',
      413,
    );
  try {
    if (kind === 'document') return documentFormat(data);
    const image = sharp(data, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    const types = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
    if (
      !metadata.format ||
      !(metadata.format in types) ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw fail('Envie uma imagem PNG, JPEG ou WebP válida.');
    await image.stats();
    return {
      mimeType: types[metadata.format as keyof typeof types],
      format: null,
    };
  } catch (error) {
    if (error instanceof AttachmentError) throw error;
    throw fail();
  }
}
