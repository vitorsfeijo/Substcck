import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AttachmentStore } from '../models/attachments.js';

function storagePath(root: string, key: string) {
  if (!/^attachments\/[a-f0-9-]{36}$/.test(key))
    throw new Error('Chave de armazenamento inválida.');
  const directory = resolve(root);
  const destination = resolve(directory, key);
  if (!destination.startsWith(directory + sep))
    throw new Error('Destino de armazenamento inválido.');
  return destination;
}

export class LocalAttachmentStore implements AttachmentStore {
  constructor(private readonly directory: string) {}
  async put(key: string, data: Buffer, _mimeType: string) {
    void _mimeType;
    const target = storagePath(this.directory, key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, data, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        await rm(target, { force: true });
      throw error;
    }
  }
  async get(key: string) {
    return { body: await readFile(storagePath(this.directory, key)) };
  }
  async remove(key: string) {
    await rm(storagePath(this.directory, key), { force: true });
  }
}

export interface S3AttachmentOptions {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3AttachmentStore implements AttachmentStore {
  private readonly client: S3Client;
  constructor(private readonly options: S3AttachmentOptions) {
    const endpoint = new URL(options.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      !options.bucket ||
      !options.region ||
      !options.accessKeyId ||
      !options.secretAccessKey
    )
      throw new Error('Configuração S3 incompleta ou inválida.');
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      maxAttempts: 2,
    });
  }
  async put(key: string, data: Buffer, mimeType: string) {
    storagePath('/objects', key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        IfNoneMatch: '*',
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }
  async get(key: string) {
    storagePath('/objects', key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    if (!result.Body) throw new Error('Objeto não encontrado.');
    const body =
      result.Body instanceof Readable
        ? result.Body
        : Buffer.from(await result.Body.transformToByteArray());
    return { body, mimeType: result.ContentType };
  }
  async remove(key: string) {
    storagePath('/objects', key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }
}
