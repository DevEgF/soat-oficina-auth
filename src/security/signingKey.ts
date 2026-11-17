import { createHash } from 'node:crypto';

// HS256 key shared with the other services: SHA-256 of the UTF-8 bytes of the raw secret.
export function deriveSigningKey(rawSecret: string): Uint8Array {
  if (Buffer.byteLength(rawSecret, 'utf8') < 32) throw new Error('INVALID_SIGNING_CONFIGURATION');
  return createHash('sha256').update(rawSecret, 'utf8').digest();
}
