import { normalizeBookmarkUrl } from './urls';
import type { BookmarkInput } from './bookmarks';

export interface RaindropImportItem {
  bookmark: BookmarkInput;
  collectionPath: string[];
}

export interface RaindropImportPlan {
  items: RaindropImportItem[];
  skipped: number;
  duplicates: number;
  unknownFields: string[];
}

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function id(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function date(value: unknown) {
  const text = string(value);
  return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : undefined;
}

export function planRaindropJsonImport(input: unknown, existingNormalizedUrls = new Set<string>()): RaindropImportPlan {
  const root = object(input);
  const rawCollections = (Array.isArray(root?.collections) ? root.collections : []) as unknown[];
  const rawItems = (Array.isArray(root?.items) ? root.items : Array.isArray(input) ? input : []) as unknown[];
  const collectionTitles = new Map<string, string>();
  const collectionParents = new Map<string, string | null>();
  const unknownFields = new Set<string>();

  for (const raw of rawCollections) {
    const value = object(raw);
    if (!value) continue;
    const collectionId = id(value._id ?? value.id);
    if (!collectionId) continue;
    collectionTitles.set(collectionId, string(value.title));
    const parent = object(value.parent);
    collectionParents.set(collectionId, id(parent?.$id ?? value.parentId) || null);
  }

  const collectionPath = (id: string | null) => {
    const path: string[] = [];
    const seen = new Set<string>();
    let current = id;
    while (current && collectionTitles.has(current) && !seen.has(current)) {
      seen.add(current);
      path.unshift(collectionTitles.get(current)!);
      current = collectionParents.get(current) ?? null;
    }
    return path;
  };

  const seenUrls = new Set(existingNormalizedUrls);
  const items: RaindropImportItem[] = [];
  let skipped = 0;
  let duplicates = 0;
  const known = new Set(['_id', 'id', 'link', 'url', 'title', 'excerpt', 'description', 'note', 'cover', 'collection', 'collectionId', 'tags', 'important', 'favorite', 'unread', 'created', 'lastUpdate']);

  for (const raw of rawItems) {
    const value = object(raw);
    if (value) {
      Object.keys(value).forEach((key) => {
        if (!known.has(key)) unknownFields.add(key);
      });
    }
    const url = string(value?.link ?? value?.url);
    if (!value || !url) {
      skipped += 1;
      continue;
    }
    let normalizedUrl = '';
    try {
      normalizedUrl = normalizeBookmarkUrl(url);
    } catch {
      skipped += 1;
      continue;
    }
    if (seenUrls.has(normalizedUrl)) {
      duplicates += 1;
      continue;
    }
    seenUrls.add(normalizedUrl);
    const collection = object(value.collection);
    items.push({
      collectionPath: collectionPath(id(collection?.$id ?? value.collectionId) || null),
      bookmark: {
        url,
        title: string(value.title) || url,
        description: string(value.excerpt ?? value.description),
        note: string(value.note),
        coverUrl: string(value.cover),
        favorite: value.important === true || value.favorite === true,
        unread: value.unread === true,
        collectionId: null,
        tags: stringArray(value.tags),
        createdAt: date(value.created),
        updatedAt: date(value.lastUpdate),
      },
    });
  }

  return { items, skipped, duplicates, unknownFields: [...unknownFields].sort() };
}
