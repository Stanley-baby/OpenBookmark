import { expect, test } from '@playwright/test';
import { summarizeRestore } from '../lib/backup-restore';
import { exportOpenBookmarkJson } from '../lib/openbookmark-json';
import type { Bookmark } from '../lib/bookmarks';

const now = '2026-07-22T00:00:00.000Z';
const current: Bookmark = {
  id: 'current',
  url: 'https://example.com/current',
  normalizedUrl: 'https://example.com/current',
  title: 'Current',
  description: '',
  coverUrl: '',
  note: '',
  favorite: false,
  unread: false,
  collectionId: null,
  tags: [],
  trashedAt: null,
  originalCollectionId: null,
  metadataError: null,
  createdAt: now,
  updatedAt: now,
};

test('previews destructive restore before replacing local data', () => {
  const incoming = exportOpenBookmarkJson([], [{ ...current, id: 'incoming' }], [], { locale: null, managerPreferences: null });
  expect(summarizeRestore({ bookmarks: [current], collections: [], tombstones: [] }, incoming)).toMatchObject({
    bookmarks: 1,
    collections: 0,
    tombstones: 0,
    addedBookmarks: 1,
    removedBookmarks: 1,
  });
});
