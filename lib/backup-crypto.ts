import { parseOpenBookmarkJson, type OpenBookmarkJson } from './openbookmark-json';

export interface EncryptedBackupEnvelope {
  format: 'openbookmark-encrypted-backup';
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 210_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterationCount: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterationCount },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function authenticatedHeader(envelope: Omit<EncryptedBackupEnvelope, 'ciphertext'>) {
  return encoder.encode(JSON.stringify(envelope));
}

export async function encryptBackupJson(data: OpenBookmarkJson, password: string): Promise<EncryptedBackupEnvelope> {
  if (!password) throw new Error('Missing recovery password');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    format: 'openbookmark-encrypted-backup',
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
  } satisfies Omit<EncryptedBackupEnvelope, 'ciphertext'>;
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: authenticatedHeader(header) }, key, encoder.encode(JSON.stringify(data)));
  return { ...header, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptBackupJson(input: unknown, password: string) {
  const envelope = input && typeof input === 'object' && !Array.isArray(input) ? input as Partial<EncryptedBackupEnvelope> : {};
  if (envelope.format !== 'openbookmark-encrypted-backup' || envelope.version !== 1) throw new Error('Unsupported encrypted backup');
  if (envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256') throw new Error('Unsupported encrypted backup parameters');
  if (typeof envelope.iterations !== 'number' || envelope.iterations < 1) throw new Error('Unsupported encrypted backup parameters');
  if (!password) throw new Error('Missing recovery password');
  try {
    const header = {
      format: envelope.format,
      version: envelope.version,
      algorithm: envelope.algorithm,
      kdf: envelope.kdf,
      iterations: envelope.iterations,
      salt: String(envelope.salt),
      iv: String(envelope.iv),
    } satisfies Omit<EncryptedBackupEnvelope, 'ciphertext'>;
    const key = await deriveKey(password, base64ToBytes(header.salt), header.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(header.iv), additionalData: authenticatedHeader(header) }, key, base64ToBytes(String(envelope.ciphertext)));
    return parseOpenBookmarkJson(JSON.parse(decoder.decode(plaintext)));
  } catch {
    throw new Error('Could not decrypt backup');
  }
}

export function isEncryptedBackup(input: unknown) {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input) && (input as { format?: unknown }).format === 'openbookmark-encrypted-backup');
}
