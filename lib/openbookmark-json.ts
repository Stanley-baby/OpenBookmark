import type { Bookmark, Collection, DeletionMarker } from './bookmarks';

export interface OpenBookmarkSettings {
  locale: 'en' | 'zh' | null;
  managerPreferences: unknown;
}

export interface OpenBookmarkJson {
  formatVersion: 1;
  exportedAt: string;
  settings: OpenBookmarkSettings;
  collections: Collection[];
  bookmarks: Bookmark[];
  tombstones: DeletionMarker[];
}

function sanitizeManagerPreferences(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    sort: input.sort === 'newest' || input.sort === 'oldest' || input.sort === 'title' ? input.sort : 'newest',
    view: input.view === 'list' || input.view === 'card' ? input.view : 'list',
    collectionFilter: typeof input.collectionFilter === 'string' ? input.collectionFilter : null,
    tagFilter: typeof input.tagFilter === 'string' ? input.tagFilter : null,
    favoriteOnly: input.favoriteOnly === true,
    unreadOnly: input.unreadOnly === true,
  };
}

export function exportOpenBookmarkJson(collections: Collection[], bookmarks: Bookmark[], tombstones: DeletionMarker[], settings: OpenBookmarkSettings): OpenBookmarkJson {
  return parseOpenBookmarkJson({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      locale: settings.locale,
      managerPreferences: sanitizeManagerPreferences(settings.managerPreferences),
    },
    collections,
    bookmarks,
    tombstones,
  });
}

function requireString(value: Record<string, unknown>, key: string) {
  if (typeof value[key] !== 'string') throw new Error(`Missing ${key}`);
}

function requireNullableString(value: Record<string, unknown>, key: string) {
  if (value[key] !== null && typeof value[key] !== 'string') throw new Error(`Invalid ${key}`);
}

function requireBoolean(value: Record<string, unknown>, key: string) {
  if (typeof value[key] !== 'boolean') throw new Error(`Missing ${key}`);
}

function requireStringArray(value: Record<string, unknown>, key: string) {
  if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every((item) => typeof item === 'string')) throw new Error(`Invalid ${key}`);
}

function asObject(value: unknown, name: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value as Record<string, unknown>;
}

export function parseOpenBookmarkJson(input: unknown): OpenBookmarkJson {
  const root = asObject(input, 'backup');
  if (typeof root.formatVersion !== 'number') throw new Error('Missing formatVersion');
  if (root.formatVersion > 1) throw new Error('Unsupported future formatVersion');
  if (root.formatVersion !== 1) throw new Error('Unsupported formatVersion');
  requireString(root, 'exportedAt');
  if (!Array.isArray(root.collections) || !Array.isArray(root.bookmarks) || !Array.isArray(root.tombstones)) throw new Error('Missing data arrays');
  const rawSettings = asObject(root.settings, 'settings');
  const settings: OpenBookmarkSettings = {
    locale: rawSettings.locale === 'en' || rawSettings.locale === 'zh' ? rawSettings.locale : null,
    managerPreferences: rawSettings.managerPreferences ?? null,
  };
  const collectionIds = new Set<string>();
  const collections = root.collections.map((item) => {
    const value = asObject(item, 'collection');
    for (const key of ['id', 'title', 'createdAt', 'updatedAt']) requireString(value, key);
    requireNullableString(value, 'parentId');
    if (typeof value.position !== 'number') throw new Error('Missing position');
    if (collectionIds.has(value.id as string)) throw new Error('Duplicate collection id');
    collectionIds.add(value.id as string);
    return {
      id: value.id as string,
      title: value.title as string,
      parentId: value.parentId as string | null,
      position: value.position as number,
      createdAt: value.createdAt as string,
      updatedAt: value.updatedAt as string,
    };
  });

  for (const collection of collections) {
    if (collection.parentId && !collectionIds.has(collection.parentId)) throw new Error('Dangling collection parent');
    const seen = new Set<string>();
    let parentId = collection.parentId;
    while (parentId) {
      if (seen.has(parentId)) throw new Error('Collection cycle');
      seen.add(parentId);
      parentId = collections.find((item) => item.id === parentId)?.parentId ?? null;
    }
  }

  const bookmarkIds = new Set<string>();
  const bookmarks = root.bookmarks.map((item) => {
    const value = asObject(item, 'bookmark');
    for (const key of ['id', 'url', 'normalizedUrl', 'title', 'description', 'coverUrl', 'note', 'createdAt', 'updatedAt']) requireString(value, key);
    for (const key of ['favorite', 'unread']) requireBoolean(value, key);
    for (const key of ['collectionId', 'trashedAt', 'originalCollectionId', 'metadataError']) requireNullableString(value, key);
    requireStringArray(value, 'tags');
    if (bookmarkIds.has(value.id as string)) throw new Error('Duplicate bookmark id');
    bookmarkIds.add(value.id as string);
    if (value.collectionId && !collectionIds.has(value.collectionId as string)) throw new Error('Dangling bookmark collection');
    return {
      id: value.id as string,
      url: value.url as string,
      normalizedUrl: value.normalizedUrl as string,
      title: value.title as string,
      description: value.description as string,
      coverUrl: value.coverUrl as string,
      note: value.note as string,
      favorite: value.favorite as boolean,
      unread: value.unread as boolean,
      collectionId: value.collectionId as string | null,
      tags: value.tags as string[],
      trashedAt: value.trashedAt as string | null,
      originalCollectionId: value.originalCollectionId as string | null,
      metadataError: value.metadataError as string | null,
      createdAt: value.createdAt as string,
      updatedAt: value.updatedAt as string,
    };
  });

  const tombstones = root.tombstones.map((item) => {
    const value = asObject(item, 'tombstone');
    for (const key of ['id', 'normalizedUrl', 'deletedAt', 'reason']) requireString(value, key);
    if (value.reason !== 'manual' && value.reason !== 'expired') throw new Error('Invalid tombstone reason');
    return {
      id: value.id as string,
      normalizedUrl: value.normalizedUrl as string,
      deletedAt: value.deletedAt as string,
      reason: value.reason as 'manual' | 'expired',
    };
  });

  return {
    formatVersion: 1,
    exportedAt: root.exportedAt as string,
    settings,
    collections,
    bookmarks,
    tombstones,
  };
}
