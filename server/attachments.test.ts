import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './data/database.js';
import { migrate } from './data/migrate.js';
import { readConfig } from './config.js';
import { seedDevelopmentData } from './scripts/seed.js';
import { createPublicationService } from './services/publication.js';
import { attachmentController } from './controllers/attachments.js';
import { createAttachmentRepository } from './attachments/repository.js';
import {
  deleteOwnedAttachment,
  pruneOrphanAttachments,
  uploadAttachment,
} from './attachments/service.js';
import {
  LocalAttachmentStore,
  S3AttachmentStore,
} from './attachments/storage.js';
import {
  DOCUMENT_LIMIT,
  IMAGE_LIMIT,
  validateAttachmentContent,
} from './attachments/validation.js';
import { AttachmentError, type AttachmentStore } from './models/attachments.js';

const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
const docx = Buffer.from(
  zipSync({
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    'word/document.xml': strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
    ),
  }),
);
const epub = Buffer.from(
  zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf"/></rootfiles></container>',
    ),
    'EPUB/book.opf': strToU8(
      '<package xmlns="http://www.idpf.org/2007/opf"><manifest/><spine/></package>',
    ),
  }),
);

describe('attachment content validation', () => {
  it('accepts decodable PNG/JPEG/WebP and validates document package contents', async () => {
    for (const [format, mime] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
    ] as const) {
      const buffer = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#b93123' },
      })
        .toFormat(format)
        .toBuffer();
      expect((await validateAttachmentContent('image', buffer)).mimeType).toBe(
        mime,
      );
    }
    for (const [data, format] of [
      [pdf, 'PDF'],
      [docx, 'DOCX'],
      [epub, 'EPUB'],
    ] as const)
      expect((await validateAttachmentContent('document', data)).format).toBe(
        format,
      );
  });

  it('rejects fake MIME/extensions, truncated data, unsafe ZIPs and decompression bombs', async () => {
    for (const data of [
      Buffer.from('<html>not an image</html>'),
      Buffer.from('PNG'),
      Buffer.alloc(0),
    ])
      await expect(
        validateAttachmentContent('image', data),
      ).rejects.toBeInstanceOf(AttachmentError);
    for (const data of [
      Buffer.from('fake.docx'),
      pdf.subarray(0, pdf.length - 20),
      Buffer.from(zipSync({ 'readme.txt': strToU8('not DOCX') })),
      Buffer.from(zipSync({ '../word/document.xml': strToU8('<document/>') })),
    ])
      await expect(
        validateAttachmentContent('document', data),
      ).rejects.toBeInstanceOf(AttachmentError);
    const bomb = Buffer.from(docx);
    const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(DOCUMENT_LIMIT + 1, central + 24);
    await expect(
      validateAttachmentContent('document', bomb),
    ).rejects.toBeInstanceOf(AttachmentError);
    const lyingSize = Buffer.from(docx);
    lyingSize.writeUInt32LE(1, central + 24);
    await expect(
      validateAttachmentContent('document', lyingSize),
    ).rejects.toBeInstanceOf(AttachmentError);
    const corrupt = Buffer.from(epub);
    const epubCentral = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    corrupt.writeUInt32LE(0, epubCentral + 16);
    await expect(
      validateAttachmentContent('document', corrupt),
    ).rejects.toBeInstanceOf(AttachmentError);
  });

  it('enforces binary limits before decoding and refuses incomplete S3 configuration', async () => {
    await expect(
      validateAttachmentContent('image', Buffer.alloc(IMAGE_LIMIT + 1)),
    ).rejects.toMatchObject({ statusCode: 413 });
    await expect(
      validateAttachmentContent('document', Buffer.alloc(DOCUMENT_LIMIT + 1)),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(
      () =>
        new S3AttachmentStore({
          endpoint: 'http://storage.invalid',
          bucket: 'files',
          region: 'auto',
          accessKeyId: 'example',
          secretAccessKey: 'example',
        }),
    ).toThrow();
  });
});

describe('attachment storage, privacy and recoverable failures', () => {
  let db: Database;
  let directory: string;
  let store: LocalAttachmentStore;
  let fixtures: Awaited<ReturnType<typeof seedDevelopmentData>>;
  let image: Buffer;
  beforeAll(async () => {
    directory = await mkdtemp(resolve('.cache/attachment-test-'));
    store = new LocalAttachmentStore(directory);
    image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    db = await openDatabase({ dataDir: 'memory://' });
    await migrate(db);
    fixtures = await seedDevelopmentData(db, { environment: 'test' });
  });
  afterAll(async () => {
    await db.close();
    const parent = resolve('.cache');
    if (
      !directory.startsWith(parent + '\\') &&
      !directory.startsWith(parent + '/')
    )
      throw new Error('Unexpected test directory.');
    await rm(directory, { recursive: true, force: true });
  });

  it('preserves existing objects on collision and rejects path traversal', async () => {
    const key = `attachments/${randomUUID()}`;
    await store.put(key, Buffer.from('original'), 'application/octet-stream');
    await expect(
      store.put(key, Buffer.from('changed'), 'application/octet-stream'),
    ).rejects.toThrow();
    expect((await store.get(key)).body.toString()).toBe('original');
    await expect(store.get('../secret')).rejects.toThrow();
    await store.remove(key);
  });

  it('does not retain metadata on storage failure and cleans up failed metadata writes', async () => {
    const repository = createAttachmentRepository(db);
    const before = (await db.query('SELECT id FROM attachments')).rows.length;
    const unavailable: AttachmentStore = {
      put: async () => {
        throw new Error('private-provider-detail');
      },
      get: (key) => store.get(key),
      remove: (key) => store.remove(key),
    };
    await expect(
      uploadAttachment(db, unavailable, {
        authorId: fixtures.author.id,
        kind: 'image',
        originalName: 'demo.png',
        data: image,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect((await db.query('SELECT id FROM attachments')).rows).toHaveLength(
      before,
    );
    let writtenKey = '';
    const observed: AttachmentStore = {
      put: async (key, data, mime) => {
        writtenKey = key;
        await store.put(key, data, mime);
      },
      get: (key) => store.get(key),
      remove: (key) => store.remove(key),
    };
    const failingDb: Database = {
      ...db,
      query: async (sql, params) => {
        if (sql.startsWith('INSERT INTO attachments'))
          throw new Error('metadata failed');
        return db.query(sql, params);
      },
    };
    await expect(
      uploadAttachment(failingDb, observed, {
        authorId: fixtures.author.id,
        kind: 'image',
        originalName: 'demo.png',
        data: image,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    await expect(store.get(writtenKey)).rejects.toThrow();
    expect(await repository.findById(writtenKey.split('/')[1]!)).toBeNull();
  });

  it('keeps long Unicode filenames within domain limits without splitting surrogate pairs', async () => {
    const publication = createPublicationService(db, {
      validate: async (url) => ({ valid: true, url }),
    });
    for (const prefix of ['', 'a']) {
      const uploaded = await uploadAttachment(db, store, {
        authorId: fixtures.author.id,
        kind: 'document',
        originalName: `${prefix}${'😀'.repeat(140)}.pdf`,
        data: pdf,
      });
      expect(uploaded.originalName.length).toBe(prefix ? 255 : 254);
      expect(Buffer.from(uploaded.originalName).toString('utf8')).toBe(
        uploaded.originalName,
      );
      const published = await publication.submit(
        {
          intent: 'publish',
          title: `Documento Unicode ${prefix || 'sem prefixo'}`,
          summary: 'Documento com nome longo e caracteres Unicode.',
          year: 2025,
          semester: 1,
          defendedAt: '2025-06-10',
          advisorId: fixtures.carlos.id,
          lumeUrl: 'https://lume.ufrgs.br/handle/10183/unicode',
          tagIds: [fixtures.tags.redes.id],
          fileId: uploaded.id,
        },
        fixtures.author,
      );
      expect(published.tcc.status).toBe('PUBLICADO');
      expect(published.tcc.file?.originalName).toBe(uploaded.originalName);
    }
  });

  it('guards uploaded content and private drafts in HTTP, and protects linked data from deletion', async () => {
    const app = Fastify({ logger: false });
    await app.register(multipart, { throwFileSizeLimit: true });
    app.decorateRequest('identity', null);
    app.addHook('onRequest', async (request) => {
      const persona = request.headers['x-test-persona'];
      const user =
        persona === 'author'
          ? fixtures.author
          : persona === 'researcher'
            ? fixtures.researcher
            : persona === 'professor'
              ? fixtures.professor
              : null;
      if (user) request.identity = { user, csrfToken: 'test-csrf' };
    });
    attachmentController(app, db, readConfig({ NODE_ENV: 'test' }), store);
    const headers = {
      origin: 'http://127.0.0.1:5173',
      'x-test-persona': 'author',
      'x-csrf-token': 'test-csrf',
    };
    const form = (data: Buffer, filename: string, extraFile = false) => {
      const boundary = 'attachment-boundary';
      const first = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );
      const extra = extraFile
        ? Buffer.concat([
            Buffer.from(
              `\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="second.png"\r\n\r\n`,
            ),
            image,
          ])
        : Buffer.alloc(0);
      return {
        payload: Buffer.concat([
          first,
          data,
          extra,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
      };
    };
    try {
      const body = form(image, 'demo.png');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/attachments?kind=image',
            ...body,
            headers: { ...body.headers },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/attachments?kind=image',
            ...body,
            headers: {
              ...body.headers,
              ...headers,
              'x-test-persona': 'professor',
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/attachments?kind=image',
            ...body,
            headers: { ...body.headers, ...headers, 'x-csrf-token': 'bad' },
          })
        ).statusCode,
      ).toBe(403);
      const multiple = form(image, 'first.png', true);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/attachments?kind=image',
            ...multiple,
            headers: { ...multiple.headers, ...headers },
          })
        ).statusCode,
      ).toBe(400);
      const tooLarge = form(Buffer.alloc(IMAGE_LIMIT + 1), 'large.png');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/attachments?kind=image',
            ...tooLarge,
            headers: { ...tooLarge.headers, ...headers },
          })
        ).statusCode,
      ).toBe(413);
      const uploaded = await app.inject({
        method: 'POST',
        url: '/api/attachments?kind=image&description=Figura',
        ...body,
        headers: { ...body.headers, ...headers },
      });
      expect(uploaded.statusCode).toBe(201);
      const dto = uploaded.json();
      expect(dto.mimeType).toBe('image/png');
      expect(dto.description).toBe('Figura');
      expect(dto).not.toHaveProperty('storageKey');
      expect((await app.inject(dto.url)).statusCode).toBe(404);
      expect(
        (
          await app.inject({
            url: dto.url,
            headers: { 'x-test-persona': 'researcher' },
          })
        ).statusCode,
      ).toBe(404);
      const owned = await app.inject({ url: dto.url, headers });
      expect(owned.statusCode).toBe(200);
      expect(owned.rawPayload).toEqual(image);
      expect(owned.headers['x-content-type-options']).toBe('nosniff');
      await db.query(
        'INSERT INTO tcc_media (id, tcc_id, url, description, position) VALUES ($1,$2,$3,$4,0)',
        [dto.id, fixtures.works.E!.id, dto.url, 'Figura'],
      );
      expect((await app.inject(dto.url)).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'DELETE', url: dto.url, headers }))
          .statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: dto.url,
            headers: { ...headers, 'x-test-persona': 'researcher' },
          })
        ).statusCode,
      ).toBe(404);
      await db.transaction(async (tx) => {
        await tx.query('DELETE FROM tcc_media WHERE id = $1', [dto.id]);
        await tx.query(
          'INSERT INTO tcc_media (id, tcc_id, url, description, position) VALUES ($1,$2,$3,$4,0)',
          [dto.id, fixtures.works.A!.id, dto.url, 'Figura'],
        );
      });
      expect((await app.inject(dto.url)).statusCode).toBe(200);
      const documentBody = form(pdf, 'tcc.pdf');
      const document = await app.inject({
        method: 'POST',
        url: '/api/attachments?kind=document',
        ...documentBody,
        headers: { ...documentBody.headers, ...headers },
      });
      expect(document.statusCode).toBe(201);
      const download = await app.inject({ url: document.json().url, headers });
      expect(download.headers['content-disposition']).toContain('attachment;');
      expect(download.headers['content-disposition']).toContain(
        "filename*=UTF-8''tcc.pdf",
      );
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: document.json().url,
            headers,
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (await app.inject({ url: document.json().url, headers })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('prunes only old, unreferenced staged files and preserves linked/recent uploads', async () => {
    const orphan = await uploadAttachment(db, store, {
      authorId: fixtures.author.id,
      kind: 'image',
      originalName: 'old.png',
      data: image,
    });
    const recent = await uploadAttachment(db, store, {
      authorId: fixtures.author.id,
      kind: 'image',
      originalName: 'recent.png',
      data: image,
    });
    await db.query(
      "UPDATE attachments SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE id <> $1",
      [recent.id],
    );
    expect(await pruneOrphanAttachments(db, store)).toBe(1);
    expect(await createAttachmentRepository(db).findById(orphan.id)).toBeNull();
    expect(
      await createAttachmentRepository(db).findById(recent.id),
    ).not.toBeNull();
    const publicMedia = (
      await db.query<{ id: string }>(
        'SELECT id FROM tcc_media WHERE tcc_id = $1',
        [fixtures.works.A!.id],
      )
    ).rows[0]!;
    expect(
      await createAttachmentRepository(db).findById(publicMedia.id),
    ).not.toBeNull();
    await deleteOwnedAttachment(db, store, recent.id, fixtures.author.id);
  });
});
