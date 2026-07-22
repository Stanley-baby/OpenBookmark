import { decryptBackupJson, encryptBackupJson, isEncryptedBackup } from './backup-crypto';
import { exportOpenBookmarkJson, parseOpenBookmarkJson, type OpenBookmarkJson, type OpenBookmarkSettings } from './openbookmark-json';
import type { Bookmark, Collection, DeletionMarker } from './bookmarks';

export interface WebDavSettings {
  url: string;
  username: string;
  password: string;
  directory: string;
  encrypted: boolean;
  recoveryPassword?: string;
  autoBackup: boolean;
}

export interface BackupVersion {
  name: string;
  url: string;
  size: number;
  formatVersion: string;
  createdAt: string;
}

export type ConnectionResult = 'ok' | 'auth-failed' | 'not-writable' | 'network-failed';

export interface BackupData {
  collections: Collection[];
  bookmarks: Bookmark[];
  tombstones: DeletionMarker[];
  settings: OpenBookmarkSettings;
}

const backupPrefix = 'openbookmark-';
const backupSuffix = '.json';

function joinUrl(base: string, directory: string, name = '') {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanDirectory = directory.replace(/^\/+|\/+$/g, '');
  return [root, cleanDirectory, name].filter(Boolean).join('/');
}

function authHeader(settings: Pick<WebDavSettings, 'username' | 'password'>) {
  return `Basic ${btoa(`${settings.username}:${settings.password}`)}`;
}

function safeNowName(now: Date) {
  return `${backupPrefix}${now.toISOString().replace(/[:.]/g, '-')}${backupSuffix}`;
}

function createdAtFromName(name: string) {
  return name
    .slice(backupPrefix.length, -backupSuffix.length)
    .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
}

export class WebDavBackupClient {
  constructor(private settings: WebDavSettings, private fetcher: typeof fetch = fetch) {}

  private request(url: string, init: RequestInit = {}) {
    return this.fetcher(url, {
      ...init,
      headers: {
        Authorization: authHeader(this.settings),
        ...(init.headers ?? {}),
      },
    });
  }

  async testConnection(): Promise<ConnectionResult> {
    const testUrl = joinUrl(this.settings.url, this.settings.directory, `.openbookmark-test-${Date.now()}`);
    try {
      const response = await this.request(testUrl, { method: 'PUT', body: 'ok' });
      if (response.status === 401 || response.status === 403) return 'auth-failed';
      if (!response.ok) return 'not-writable';
      await this.request(testUrl, { method: 'DELETE' });
      return 'ok';
    } catch {
      return 'network-failed';
    }
  }

  async uploadVersion(body: string, now = new Date()): Promise<BackupVersion> {
    const name = safeNowName(now);
    const finalUrl = joinUrl(this.settings.url, this.settings.directory, name);
    const tempUrl = `${finalUrl}.tmp-${crypto.randomUUID()}`;
    const put = await this.request(tempUrl, { method: 'PUT', body });
    if (!put.ok) throw new Error(put.status === 401 || put.status === 403 ? 'Authentication failed' : 'Could not upload temporary backup');
    const move = await this.request(tempUrl, { method: 'MOVE', headers: { Destination: finalUrl, Overwrite: 'F' } });
    if (!move.ok) {
      await this.request(tempUrl, { method: 'DELETE' }).catch(() => undefined);
      throw new Error('Could not commit backup version');
    }
    return { name, url: finalUrl, size: new Blob([body]).size, formatVersion: this.settings.encrypted ? 'encrypted-v1' : 'json-v1', createdAt: now.toISOString() };
  }

  async listVersions(): Promise<BackupVersion[]> {
    const response = await this.request(joinUrl(this.settings.url, this.settings.directory), { method: 'PROPFIND', headers: { Depth: '1' } });
    if (!response.ok) throw new Error('Could not list backups');
    const xml = await response.text();
    return (xml.match(/<[^:>]*:?response>[\s\S]*?<\/[^:>]*:?response>/g) ?? [])
      .map((block) => ({
        href: decodeURIComponent(block.match(/<[^:>]*:?href>([^<]+)<\/[^:>]*:?href>/)?.[1] ?? ''),
        size: Number(block.match(/<[^:>]*:?getcontentlength>(\d+)<\/[^:>]*:?getcontentlength>/)?.[1] ?? 0),
      }))
      .filter((item) => item.href.includes(backupPrefix) && item.href.endsWith(backupSuffix))
      .map(({ href, size }) => {
        const name = href.split('/').pop()!;
        return {
          name,
          url: href.startsWith('http') ? href : joinUrl(this.settings.url, this.settings.directory, name),
          size,
          formatVersion: 'backup-v1',
          createdAt: createdAtFromName(name),
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  async downloadVersion(version: BackupVersion) {
    const response = await this.request(version.url);
    if (!response.ok) throw new Error('Could not download backup');
    return response.text();
  }

  async deleteVersion(version: BackupVersion) {
    const response = await this.request(version.url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete old backup');
  }
}

export async function serializeBackup(data: BackupData, settings: WebDavSettings) {
  const json = exportOpenBookmarkJson(data.collections, data.bookmarks, data.tombstones, data.settings);
  return JSON.stringify(settings.encrypted ? await encryptBackupJson(json, settings.recoveryPassword ?? '') : json);
}

export async function parseBackup(text: string, password = ''): Promise<OpenBookmarkJson> {
  const value = JSON.parse(text);
  return isEncryptedBackup(value) ? decryptBackupJson(value, password) : parseOpenBookmarkJson(value);
}

export async function uploadBackup(client: WebDavBackupClient, data: BackupData, settings: WebDavSettings, now = new Date()) {
  return client.uploadVersion(await serializeBackup(data, settings), now);
}

export async function enforceBackupRetention(client: WebDavBackupClient, versions: BackupVersion[], keep = 30) {
  for (const version of versions.slice(keep)) await client.deleteVersion(version);
}
