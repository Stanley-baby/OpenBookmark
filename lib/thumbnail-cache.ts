export const thumbnailPlaceholder = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><rect width="100%" height="100%" fill="%23f6f5f4"/><path d="M48 62h64M58 45h44" stroke="%23999" stroke-width="6" stroke-linecap="round"/></svg>';

export interface ThumbnailEntry {
  key: string;
  blob: Blob;
  size: number;
  lastUsedAt: number;
}

export interface ThumbnailStore {
  get(key: string): Promise<ThumbnailEntry | undefined>;
  put(entry: ThumbnailEntry): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  list(): Promise<ThumbnailEntry[]>;
}

export function planThumbnailEviction(entries: Pick<ThumbnailEntry, 'key' | 'size' | 'lastUsedAt'>[], maxBytes: number) {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const evict: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
    if (total <= maxBytes) break;
    evict.push(entry.key);
    total -= entry.size;
  }
  return evict;
}

export class ThumbnailCache {
  constructor(
    private store: ThumbnailStore,
    private maxBytes = 500 * 1024 * 1024,
    private now = () => Date.now(),
    private fetcher: typeof fetch = fetch,
  ) {}

  async getOrFetch(url: string) {
    if (!url) return thumbnailPlaceholder;
    const cached = await this.store.get(url);
    if (cached) {
      if (!cached.blob.size) {
        await this.store.delete(url);
      } else {
        await this.store.put({ ...cached, lastUsedAt: this.now() });
        return URL.createObjectURL(cached.blob);
      }
    }

    return this.fetchAndCache(url);
  }

  async getCached(url: string) {
    if (!url) return thumbnailPlaceholder;
    const cached = await this.store.get(url);
    if (!cached?.blob.size) {
      if (cached) await this.store.delete(url);
      return thumbnailPlaceholder;
    }
      await this.store.put({ ...cached, lastUsedAt: this.now() });
      return URL.createObjectURL(cached.blob);
  }

  async fetchAndCache(url: string) {
    try {
      const response = await this.fetcher(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Empty thumbnail');
      await this.store.put({ key: url, blob, size: blob.size, lastUsedAt: this.now() });
      await this.prune();
      return URL.createObjectURL(blob);
    } catch {
      return thumbnailPlaceholder;
    }
  }

  async prune() {
    for (const key of planThumbnailEviction(await this.store.list(), this.maxBytes)) {
      await this.store.delete(key);
    }
  }

  async clear() {
    await this.store.clear();
  }
}
