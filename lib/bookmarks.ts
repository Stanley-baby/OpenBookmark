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
}

export interface Collection {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
      const values = { ...fields, normalizedUrl, updatedAt: now };

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
};

export const collectionRepository = {
  list() {
    return db.collections.orderBy('title').toArray();
  },
};
