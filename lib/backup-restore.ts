import type { Bookmark, Collection, DeletionMarker } from './bookmarks';
import type { OpenBookmarkJson } from './openbookmark-json';

export interface RestoreSummary {
  sourceExportedAt: string;
  bookmarks: number;
  collections: number;
  tombstones: number;
  addedBookmarks: number;
  removedBookmarks: number;
}

export function summarizeRestore(current: { bookmarks: Bookmark[]; collections: Collection[]; tombstones: DeletionMarker[] }, incoming: OpenBookmarkJson): RestoreSummary {
  const currentIds = new Set(current.bookmarks.map((bookmark) => bookmark.id));
  const incomingIds = new Set(incoming.bookmarks.map((bookmark) => bookmark.id));
  return {
    sourceExportedAt: incoming.exportedAt,
    bookmarks: incoming.bookmarks.length,
    collections: incoming.collections.length,
    tombstones: incoming.tombstones.length,
    addedBookmarks: incoming.bookmarks.filter((bookmark) => !currentIds.has(bookmark.id)).length,
    removedBookmarks: current.bookmarks.filter((bookmark) => !incomingIds.has(bookmark.id)).length,
  };
}
