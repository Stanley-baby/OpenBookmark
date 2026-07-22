import Dexie, { type Table } from 'dexie';
import type { ThumbnailEntry, ThumbnailStore } from './thumbnail-cache';

class ThumbnailDatabase extends Dexie {
  thumbnails!: Table<ThumbnailEntry, string>;

  constructor() {
    super('openbookmark-thumbnails');
    this.version(1).stores({ thumbnails: 'key,lastUsedAt' });
  }
}

const thumbnailDb = new ThumbnailDatabase();

export const indexedDbThumbnailStore: ThumbnailStore = {
  get(key) {
    return thumbnailDb.thumbnails.get(key);
  },
  put(entry) {
    return thumbnailDb.thumbnails.put(entry).then(() => undefined);
  },
  delete(key) {
    return thumbnailDb.thumbnails.delete(key);
  },
  clear() {
    return thumbnailDb.thumbnails.clear();
  },
  list() {
    return thumbnailDb.thumbnails.toArray();
  },
};
