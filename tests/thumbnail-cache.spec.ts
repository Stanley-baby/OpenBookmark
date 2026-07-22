import { expect, test } from '@playwright/test';
import { planThumbnailEviction, ThumbnailCache, thumbnailPlaceholder, type ThumbnailEntry, type ThumbnailStore } from '../lib/thumbnail-cache';

class MemoryThumbnailStore implements ThumbnailStore {
  entries = new Map<string, ThumbnailEntry>();
  get(key: string) { return Promise.resolve(this.entries.get(key)); }
  put(entry: ThumbnailEntry) { this.entries.set(entry.key, entry); return Promise.resolve(); }
  delete(key: string) { this.entries.delete(key); return Promise.resolve(); }
  clear() { this.entries.clear(); return Promise.resolve(); }
  list() { return Promise.resolve([...this.entries.values()]); }
}

test('evicts least recently used thumbnails over the configured cap', () => {
  expect(planThumbnailEviction([
    { key: 'old', size: 4, lastUsedAt: 1 },
    { key: 'new', size: 4, lastUsedAt: 2 },
    { key: 'tiny', size: 1, lastUsedAt: 3 },
  ], 5)).toEqual(['old']);
});

test('serves cached covers offline and falls back to placeholder for misses', async () => {
  const store = new MemoryThumbnailStore();
  await store.put({ key: 'https://example.com/cover.jpg', blob: new Blob(['cached']), size: 6, lastUsedAt: 1 });
  const cache = new ThumbnailCache(store, 10, () => 2, async () => { throw new Error('offline'); });

  expect(await cache.getOrFetch('https://example.com/cover.jpg')).toContain('blob:');
  expect(await cache.getOrFetch('https://example.com/missing.jpg')).toBe(thumbnailPlaceholder);
  expect(store.entries.get('https://example.com/cover.jpg')?.lastUsedAt).toBe(2);
});

test('discards corrupt empty cached covers before regenerating', async () => {
  const store = new MemoryThumbnailStore();
  await store.put({ key: 'https://example.com/cover.jpg', blob: new Blob([]), size: 0, lastUsedAt: 1 });
  const cache = new ThumbnailCache(store, 10, () => 2, async () => new Response(new Blob(['fresh'])));

  expect(await cache.getOrFetch('https://example.com/cover.jpg')).toContain('blob:');
  expect(store.entries.get('https://example.com/cover.jpg')?.size).toBe(5);
});

test('cached-only reads do not fetch missing covers during passive browsing', async () => {
  let fetched = false;
  const cache = new ThumbnailCache(new MemoryThumbnailStore(), 10, () => 2, async () => {
    fetched = true;
    return new Response(new Blob(['fresh']));
  });

  expect(await cache.getCached('https://example.com/missing.jpg')).toBe(thumbnailPlaceholder);
  expect(fetched).toBe(false);
});
