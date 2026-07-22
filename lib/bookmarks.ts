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
}

export interface Collection {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
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
  }
}

const db = new OpenBookmarkDatabase();

export const bookmarkRepository = {
  async save(input: BookmarkInput) {
    return db.transaction('rw', db.bookmarks, async () => {
      const normalizedUrl = normalizeBookmarkUrl(input.url);
      const duplicate = await db.bookmarks.where('normalizedUrl').equals(normalizedUrl).first();
      const existing = duplicate ?? (input.id ? await db.bookmarks.get(input.id) : undefined);
      const now = new Date().toISOString();
      const { id: _, ...fields } = input;
      const values = { ...fields, tags: normalizeTags(input.tags), normalizedUrl, updatedAt: now };

      if (existing) {
        await db.bookmarks.update(existing.id, values);
        return { id: existing.id, created: false };
      }

      const id = crypto.randomUUID();
      await db.bookmarks.add({ ...values, id, createdAt: now });
      return { id, created: true };
    });
  },

  findByUrl(url: string) {
    return db.bookmarks.where('normalizedUrl').equals(normalizeBookmarkUrl(url)).first();
  },

  list() {
    return db.bookmarks.orderBy('createdAt').reverse().toArray();
  },

  watch() {
    return liveQuery(() => this.list());
  },

  watchByUrl(url: string) {
    return liveQuery(() => this.findByUrl(url));
  },

  setCollection(id: string, collectionId: string | null) {
    return db.bookmarks.update(id, { collectionId, updatedAt: new Date().toISOString() });
  },

  setTags(id: string, tags: string[]) {
    return db.bookmarks.update(id, { tags: normalizeTags(tags), updatedAt: new Date().toISOString() });
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
