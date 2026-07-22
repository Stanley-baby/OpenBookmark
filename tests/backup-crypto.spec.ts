import { expect, test } from '@playwright/test';
import { decryptBackupJson, encryptBackupJson } from '../lib/backup-crypto';
import { exportOpenBookmarkJson } from '../lib/openbookmark-json';

const backup = exportOpenBookmarkJson([], [], [], { locale: 'en', managerPreferences: null });

test('encrypts backup JSON with fresh parameters and decrypts with the recovery password', async () => {
  const first = await encryptBackupJson(backup, 'correct horse');
  const second = await encryptBackupJson(backup, 'correct horse');

  expect(JSON.stringify(first)).not.toContain('bookmarks');
  expect(first.salt).not.toBe(second.salt);
  expect(first.iv).not.toBe(second.iv);
  await expect(decryptBackupJson(first, 'correct horse')).resolves.toMatchObject({ formatVersion: 1, bookmarks: [] });
});

test('rejects wrong passwords and tampered authenticated data', async () => {
  const encrypted = await encryptBackupJson(backup, 'correct horse');

  await expect(decryptBackupJson(encrypted, 'wrong')).rejects.toThrow('Could not decrypt backup');
  await expect(decryptBackupJson({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }, 'correct horse')).rejects.toThrow('Could not decrypt backup');
  await expect(decryptBackupJson({ ...encrypted, iterations: encrypted.iterations + 1 }, 'correct horse')).rejects.toThrow('Could not decrypt backup');
  await expect(decryptBackupJson({ ...encrypted, algorithm: 'AES-CBC' }, 'correct horse')).rejects.toThrow('Unsupported encrypted backup parameters');
});
