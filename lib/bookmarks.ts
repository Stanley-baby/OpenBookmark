import Dexie, { liveQuery, type Table } from 'dexie';
import { normalizeBookmarkUrl } from './urls';

export interface Bookmark {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  description: string;
  coverUrl: string;
  note: string;
  favorite: boolean;
  unread: boolean;
  collectionId: string | null;
  tags: string[];
  trashedAt: string | null;
  originalCollectionId: string | null;
  metadataError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkInput {
  id?: string;
  url: string;
  title: string;
  description: string;
  coverUrl: string;
  note: string;
  favorite: boolean;
  unread: boolean;
  collectionId: string | null;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Collection {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface DeletionMarker {
  id: string;
  normalizedUrl: string;
  deletedAt: string;
  reason: 'manual' | 'expired';
}

function normalizeTags(tags: string[]) {
  const unique = new Map<string, string>();
  for (const value of tags) {
    const tag = value.trim();
    if (tag && !unique.has(tag.toLocaleLowerCase())) unique.set(tag.toLocaleLowerCase(), tag);
  }
  return [...unique.values()];
}

export function collectionPath(collection: Collection, collections: Collection[]) {
  const titles = [collection.title];
  const byId = new Map(collections.map((item) => [item.id, item]));
  let parent = collection.parentId ? byId.get(collection.parentId) : undefined;
  while (parent) {
    titles.unshift(parent.title);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return titles.join(' / ');
}

export function collectionDescendantIds(id: string, collections: Collection[]) {
  const descendants = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const collection of collections) {
      if (collection.parentId === parentId && !descendants.has(collection.id)) {
        descendants.add(collection.id);
        pending.push(collection.id);
      }
    }
  }
  return descendants;
}

function sortCollectionTree(collections: Collection[]) {
  const result: Collection[] = [];
  const appendChildren = (parentId: string | null) => {
    collections
      .filter((collection) => collection.parentId === parentId)
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
      .forEach((collection) => {
        result.push(collection);
        appendChildren(collection.id);
      });
  };
  appendChildren(null);
  return result;
}

function nextSiblingPosition(collections: Collection[], parentId: string | null) {
  return Math.max(-1, ...collections.filter((collection) => collection.parentId === parentId).map((collection) => collection.position)) + 1;
}

class OpenBookmarkDatabase extends Dexie {
  bookmarks!: Table<Bookmark, string>;
  collections!: Table<Collection, string>;
  tombstones!: Table<DeletionMarker, string>;

  constructor() {
    super('openbookmark');
    this.version(1).stores({ bookmarks: 'id,&url,createdAt' });
    this.version(2).stores({ bookmarks: 'id,normalizedUrl,createdAt', collections: 'id,title' }).upgrade((transaction) =>
      transaction.table<Bookmark>('bookmarks').toCollection().modify((bookmark) => {
        bookmark.normalizedUrl = normalizeBookmarkUrl(bookmark.url);
        bookmark.description ??= '';
        bookmark.coverUrl ??= '';
        bookmark.note ??= '';
        bookmark.favorite ??= false;
        bookmark.unread ??= false;
        bookmark.collectionId ??= null;
      }),
    );
    this.version(3).stores({ bookmarks: 'id,normalizedUrl,createdAt,collectionId,*tags', collections: 'id,parentId,title' }).upgrade(async (transaction) => {
      await transaction.table<Bookmark>('bookmarks').toCollection().modify((bookmark) => {
        bookmark.tags ??= [];
      });
      const collectionTable = transaction.table<Collection>('collections');
      const collections = (await collectionTable.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
      for (const [position, collection] of collections.entries()) {
        await collectionTable.update(collection.id, { parentId: null, position });
      }
    });
    this.version(4).stores({ bookmarks: 'id,normalizedUrl,createdAt,collectionId,*tags,trashedAt', collections: 'id,parentId,title', tombstones: 'id,deletedAt' }).upgrade((transaction) =>
      transaction.table<Bookmark>('bookmarks').toCollection().modify((bookmark) => {
        bookmark.trashedAt ??= null;
        bookmark.originalCollectionId ??= null;
      }),
    );
    this.version(5).stores({ bookmarks: 'id,normalizedUrl,createdAt,collectionId,*tags,trashedAt', collections: 'id,parentId,title', tombstones: 'id,deletedAt' }).upgrade((transaction) =>
      transaction.table<Bookmark>('bookmarks').toCollection().modify((bookmark) => {
        bookmark.metadataError ??= null;
      }),
    );
  }
}

const db = new OpenBookmarkDatabase();
const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;

export const trashCleanupErrorKey = 'trashCleanupError';

export const bookmarkRepository = {
  async save(input: BookmarkInput) {
    return db.transaction('rw', db.bookmarks, async () => {
      const normalizedUrl = normalizeBookmarkUrl(input.url);
      const duplicate = await db.bookmarks.where('normalizedUrl').equals(normalizedUrl).filter((bookmark) => !bookmark.trashedAt).first();
      const inputBookmark = input.id ? await db.bookmarks.get(input.id) : undefined;
      const existing = duplicate ?? (inputBookmark && !inputBookmark.trashedAt ? inputBookmark : undefined);
      const now = new Date().toISOString();
      const values = {
        url: input.url,
        title: input.title,
        description: input.description,
        coverUrl: input.coverUrl,
        note: input.note,
        favorite: input.favorite,
        unread: input.unread,
        collectionId: input.collectionId,
        tags: normalizeTags(input.tags),
        metadataError: null,
        normalizedUrl,
        updatedAt: input.updatedAt ?? now,
      };

      if (existing) {
        await db.bookmarks.update(existing.id, values);
        return { id: existing.id, created: false };
      }

      const id = crypto.randomUUID();
      await db.bookmarks.add({ ...values, id, trashedAt: null, originalCollectionId: null, createdAt: input.createdAt ?? now });
      return { id, created: true };
    });
  },

  findByUrl(url: string) {
    return db.bookmarks.where('normalizedUrl').equals(normalizeBookmarkUrl(url)).filter((bookmark) => !bookmark.trashedAt).first();
  },

  list() {
    return db.bookmarks.orderBy('createdAt').reverse().filter((bookmark) => !bookmark.trashedAt).toArray();
  },

  async listTrash() {
    return (await db.bookmarks.filter((bookmark) => Boolean(bookmark.trashedAt)).toArray())
      .sort((a, b) => b.trashedAt!.localeCompare(a.trashedAt!));
  },

  watch() {
    return liveQuery(() => this.list());
  },

  watchByUrl(url: string) {
    return liveQuery(() => this.findByUrl(url));
  },

  watchTrash() {
    return liveQuery(() => this.listTrash());
  },

  async moveToTrash(id: string, now = new Date()) {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark || bookmark.trashedAt) return;
    await db.bookmarks.update(id, {
      trashedAt: now.toISOString(),
      originalCollectionId: bookmark.collectionId,
      updatedAt: now.toISOString(),
    });
  },

  async restore(id: string) {
    return db.transaction('rw', db.bookmarks, db.collections, async () => {
      const bookmark = await db.bookmarks.get(id);
      if (!bookmark?.trashedAt) return { restoredToUnsorted: false, duplicate: false };
      const originalCollectionExists = bookmark.originalCollectionId
        ? Boolean(await db.collections.get(bookmark.originalCollectionId))
        : true;
      const activeDuplicate = await db.bookmarks
        .where('normalizedUrl')
        .equals(bookmark.normalizedUrl)
        .filter((candidate) => candidate.id !== id && !candidate.trashedAt)
        .first();
      if (activeDuplicate) return { restoredToUnsorted: false, duplicate: true };
      await db.bookmarks.update(id, {
        collectionId: originalCollectionExists ? bookmark.originalCollectionId : null,
        originalCollectionId: null,
        trashedAt: null,
        updatedAt: new Date().toISOString(),
      });
      return { restoredToUnsorted: !originalCollectionExists, duplicate: false };
    });
  },

  async permanentlyDelete(id: string, now = new Date()) {
    await db.transaction('rw', db.bookmarks, db.tombstones, async () => {
      const bookmark = await db.bookmarks.get(id);
      if (!bookmark?.trashedAt) return;
      await db.tombstones.put({ id, normalizedUrl: bookmark.normalizedUrl, deletedAt: now.toISOString(), reason: 'manual' });
      await db.bookmarks.delete(id);
    });
  },

  async emptyTrash(now = new Date()) {
    await db.transaction('rw', db.bookmarks, db.tombstones, async () => {
      const trashed = await db.bookmarks.filter((bookmark) => Boolean(bookmark.trashedAt)).toArray();
      await db.tombstones.bulkPut(trashed.map((bookmark) => ({
        id: bookmark.id,
        normalizedUrl: bookmark.normalizedUrl,
        deletedAt: now.toISOString(),
        reason: 'manual',
      })));
      await db.bookmarks.bulkDelete(trashed.map((bookmark) => bookmark.id));
    });
  },

  async cleanupExpiredTrash(now = new Date()) {
    return db.transaction('rw', db.bookmarks, db.tombstones, async () => {
      const cutoff = new Date(now.getTime() - trashRetentionMs).toISOString();
      const expired = await db.bookmarks
        .filter((bookmark) => Boolean(bookmark.trashedAt && bookmark.trashedAt < cutoff))
        .toArray();
      await db.tombstones.bulkPut(expired.map((bookmark) => ({
        id: bookmark.id,
        normalizedUrl: bookmark.normalizedUrl,
        deletedAt: now.toISOString(),
        reason: 'expired',
      })));
      await db.bookmarks.bulkDelete(expired.map((bookmark) => bookmark.id));
      return expired.length;
    });
  },

  setCollection(id: string, collectionId: string | null) {
    return db.bookmarks.update(id, { collectionId, updatedAt: new Date().toISOString() });
  },

  setTags(id: string, tags: string[]) {
    return db.bookmarks.update(id, { tags: normalizeTags(tags), updatedAt: new Date().toISOString() });
  },

  bulkSetCollection(ids: string[], collectionId: string | null) {
    return db.bookmarks.where('id').anyOf(ids).modify({ collectionId, updatedAt: new Date().toISOString() });
  },

  bulkAddTags(ids: string[], tags: string[]) {
    const additions = normalizeTags(tags);
    if (!additions.length) return Promise.resolve(0);
    return db.bookmarks.where('id').anyOf(ids).modify((bookmark) => {
      bookmark.tags = normalizeTags([...bookmark.tags, ...additions]);
      bookmark.updatedAt = new Date().toISOString();
    });
  },

  bulkRemoveTags(ids: string[], tags: string[]) {
    const removals = new Set(normalizeTags(tags).map((tag) => tag.toLocaleLowerCase()));
    if (!removals.size) return Promise.resolve(0);
    return db.bookmarks.where('id').anyOf(ids).modify((bookmark) => {
      bookmark.tags = bookmark.tags.filter((tag) => !removals.has(tag.toLocaleLowerCase()));
      bookmark.updatedAt = new Date().toISOString();
    });
  },

  bulkSetFavorite(ids: string[], favorite: boolean) {
    return db.bookmarks.where('id').anyOf(ids).modify({ favorite, updatedAt: new Date().toISOString() });
  },

  bulkSetUnread(ids: string[], unread: boolean) {
    return db.bookmarks.where('id').anyOf(ids).modify({ unread, updatedAt: new Date().toISOString() });
  },

  bulkMoveToTrash(ids: string[], now = new Date()) {
    const timestamp = now.toISOString();
    return db.bookmarks.where('id').anyOf(ids).modify((bookmark) => {
      if (bookmark.trashedAt) return;
      bookmark.trashedAt = timestamp;
      bookmark.originalCollectionId = bookmark.collectionId;
      bookmark.updatedAt = timestamp;
    });
  },

  async updateMetadata(id: string, metadata: { title: string; description: string; coverUrl: string }) {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark) return 0;
    return db.bookmarks.update(id, {
      title: metadata.title || bookmark.title,
      description: metadata.description || bookmark.description,
      coverUrl: metadata.coverUrl || bookmark.coverUrl,
      metadataError: null,
      updatedAt: new Date().toISOString(),
    });
  },

  markMetadataRefreshFailed(id: string, metadataError: string) {
    return db.bookmarks.update(id, { metadataError, updatedAt: new Date().toISOString() });
  },
};

export const collectionRepository = {
  async list() {
    return sortCollectionTree(await db.collections.toArray());
  },

  watch() {
    return liveQuery(() => this.list());
  },

  async create(title: string, parentId: string | null) {
    const now = new Date().toISOString();
    const collections = await db.collections.toArray();
    const id = crypto.randomUUID();
    await db.collections.add({ id, title: title.trim(), parentId, position: nextSiblingPosition(collections, parentId), createdAt: now, updatedAt: now });
    return id;
  },

  rename(id: string, title: string) {
    return db.collections.update(id, { title: title.trim(), updatedAt: new Date().toISOString() });
  },

  async move(id: string, parentId: string | null) {
    const collections = await db.collections.toArray();
    if (id === parentId || (parentId && collectionDescendantIds(id, collections).has(parentId))) {
      throw new Error('A collection cannot be moved inside itself.');
    }
    await db.collections.update(id, { parentId, position: nextSiblingPosition(collections, parentId), updatedAt: new Date().toISOString() });
  },

  async reorder(id: string, direction: -1 | 1) {
    const collection = await db.collections.get(id);
    if (!collection) return;
    const siblings = (await db.collections.toArray())
      .filter((item) => item.parentId === collection.parentId)
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    const index = siblings.findIndex((item) => item.id === id);
    const adjacentSibling = siblings[index + direction];
    if (!adjacentSibling) return;
    await db.transaction('rw', db.collections, async () => {
      await db.collections.update(collection.id, { position: adjacentSibling.position, updatedAt: new Date().toISOString() });
      await db.collections.update(adjacentSibling.id, { position: collection.position, updatedAt: new Date().toISOString() });
    });
  },

  async deleteImpact(id: string) {
    return {
      bookmarks: await db.bookmarks.where('collectionId').equals(id).count(),
      children: await db.collections.where('parentId').equals(id).count(),
    };
  },

  async delete(id: string) {
    await db.transaction('rw', db.bookmarks, db.collections, async () => {
      const collection = await db.collections.get(id);
      if (!collection) return;
      const children = await db.collections.where('parentId').equals(id).toArray();
      const collections = await db.collections.toArray();
      const firstChildPosition = nextSiblingPosition(collections.filter((item) => item.id !== id), collection.parentId);
      await db.bookmarks.where('collectionId').equals(id).modify({ collectionId: collection.parentId, updatedAt: new Date().toISOString() });
      for (const [index, child] of children.entries()) {
        await db.collections.update(child.id, { parentId: collection.parentId, position: firstChildPosition + index, updatedAt: new Date().toISOString() });
      }
      await db.collections.delete(id);
    });
  },
};
