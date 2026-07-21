import Dexie, { liveQuery, type Table } from 'dexie';

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

class OpenBookmarkDatabase extends Dexie {
  bookmarks!: Table<Bookmark, string>;

  constructor() {
    super('openbookmark');
    this.version(1).stores({ bookmarks: 'id,&url,createdAt' });
  }
}

const db = new OpenBookmarkDatabase();

export const bookmarkRepository = {
  async save(url: string, title: string) {
    return db.transaction('rw', db.bookmarks, async () => {
      const existing = await db.bookmarks.where('url').equals(url).first();
      const now = new Date().toISOString();

      if (existing) {
        await db.bookmarks.update(existing.id, { title, updatedAt: now });
        return existing.id;
      }

      const id = crypto.randomUUID();
      await db.bookmarks.add({ id, url, title, createdAt: now, updatedAt: now });
      return id;
    });
  },

  list() {
    return db.bookmarks.orderBy('createdAt').reverse().toArray();
  },

  watch() {
    return liveQuery(() => this.list());
  },
};
