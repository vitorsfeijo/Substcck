import type { ServerConfig } from './config.js';
import type { AttachmentStore } from './models/attachments.js';
import {
  LocalAttachmentStore,
  S3AttachmentStore,
} from './attachments/storage.js';

export function createAttachmentStore(
  config: ServerConfig,
): AttachmentStore | undefined {
  if (config.storage.driver === 'local')
    return new LocalAttachmentStore(config.storage.localDirectory);
  if (config.storage.driver === 's3' && config.storage.s3)
    return new S3AttachmentStore(config.storage.s3);
  return undefined;
}
