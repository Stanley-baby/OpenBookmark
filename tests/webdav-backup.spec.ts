import { expect, test } from '@playwright/test';
import { WebDavBackupClient, enforceBackupRetention, parseBackup, serializeBackup, uploadBackup, type BackupVersion, type WebDavSettings } from '../lib/webdav-backup';

const settings: WebDavSettings = {
  url: 'https://dav.example',
  username: 'user',
  password: 'secret',
  directory: 'OpenBookmark',
  encrypted: false,
  autoBackup: false,
};

test('connection test distinguishes auth, write and network failures without exposing credentials', async () => {
  const auth = new WebDavBackupClient(settings, async () => new Response('', { status: 401 }));
  const readonly = new WebDavBackupClient(settings, async () => new Response('', { status: 409 }));
  const network = new WebDavBackupClient(settings, async () => { throw new Error('boom'); });

  await expect(auth.testConnection()).resolves.toBe('auth-failed');
  await expect(readonly.testConnection()).resolves.toBe('not-writable');
  await expect(network.testConnection()).resolves.toBe('network-failed');
});

test('backup upload commits through a temporary object and keeps existing versions on failure', async () => {
  const methods: string[] = [];
  const client = new WebDavBackupClient(settings, async (_url, init) => {
    methods.push(init?.method ?? 'GET');
    if (init?.method === 'MOVE') return new Response('', { status: 500 });
    return new Response('', { status: 201 });
  });

  await expect(uploadBackup(client, { collections: [], bookmarks: [], tombstones: [], settings: { locale: null, managerPreferences: null } }, settings)).rejects.toThrow('Could not commit backup version');
  expect(methods).toEqual(['PUT', 'MOVE', 'DELETE']);
});

test('unencrypted backup packages parse through the versioned JSON validator', async () => {
  const text = await serializeBackup({ collections: [], bookmarks: [], tombstones: [], settings: { locale: 'zh', managerPreferences: null } }, settings);
  await expect(parseBackup(text)).resolves.toMatchObject({ formatVersion: 1, settings: { locale: 'zh' } });
});

test('lists remote backup versions with timestamp, size and format version', async () => {
  const client = new WebDavBackupClient(settings, async () => new Response(`<?xml version="1.0"?>
    <d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/OpenBookmark/openbookmark-2026-07-22T00-00-00-000Z.json</d:href><d:propstat><d:prop><d:getcontentlength>123</d:getcontentlength></d:prop></d:propstat></d:response>
    </d:multistatus>`));

  await expect(client.listVersions()).resolves.toEqual([{
    name: 'openbookmark-2026-07-22T00-00-00-000Z.json',
    url: 'https://dav.example/OpenBookmark/openbookmark-2026-07-22T00-00-00-000Z.json',
    size: 123,
    formatVersion: 'backup-v1',
    createdAt: '2026-07-22T00:00:00.000Z',
  }]);
});

test('retention deletes only versions beyond the successful keep window', async () => {
  const deleted: string[] = [];
  const client = { deleteVersion: (version: BackupVersion) => { deleted.push(version.name); return Promise.resolve(); } } as WebDavBackupClient;
  await enforceBackupRetention(client, Array.from({ length: 32 }, (_, index) => ({ name: `v${index}`, url: `u${index}`, size: 1, formatVersion: 'json-v1', createdAt: '' })), 30);
  expect(deleted).toEqual(['v30', 'v31']);
});
