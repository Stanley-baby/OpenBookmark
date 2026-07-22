import { expect, test } from '@playwright/test';
import { exportOpenBookmarkJson, parseOpenBookmarkJson } from '../lib/openbookmark-json';
import type { Bookmark, Collection, DeletionMarker } from '../lib/bookmarks';

const now = '2026-07-22T00:00:00.000Z';
const collection: Collection = { id: 'c1', title: 'Work', parentId: null, position: 0, createdAt: now, updatedAt: now };
const bookmark: Bookmark = {
  id: 'b1',
  url: 'https://example.com',
  normalizedUrl: 'https://example.com/',
  title: 'Example',
  description: 'Description',
  coverUrl: 'https://example.com/cover.jpg',
  note: 'Note',
  favorite: true,
  unread: false,
  collectionId: 'c1',
  tags: ['tag'],
  trashedAt: null,
  originalCollectionId: null,
  metadataError: null,
  createdAt: now,
  updatedAt: now,
};
const tombstone: DeletionMarker = { id: 't1', normalizedUrl: 'https://deleted.example/', deletedAt: now, reason: 'manual' };

test('round-trips the versioned OpenBookmark JSON format', () => {
  const exported = exportOpenBookmarkJson([collection], [bookmark], [tombstone], { locale: 'en', managerPreferences: { sort: 'title' } });
  expect(parseOpenBookmarkJson(JSON.parse(JSON.stringify(exported)))).toMatchObject({
    formatVersion: 1,
    settings: { locale: 'en', managerPreferences: { sort: 'title' } },
    collections: [collection],
    bookmarks: [bookmark],
    tombstones: [tombstone],
  });
});

test('rejects future versions and invalid references before import', () => {
  expect(() => parseOpenBookmarkJson({ formatVersion: 2, exportedAt: now, settings: {}, collections: [], bookmarks: [], tombstones: [] })).toThrow('Unsupported future formatVersion');
  expect(() => parseOpenBookmarkJson({
    formatVersion: 1,
    exportedAt: now,
    settings: {},
    collections: [{ ...collection, id: 'loop', parentId: 'loop' }],
    bookmarks: [],
    tombstones: [],
  })).toThrow('Collection cycle');
  expect(() => parseOpenBookmarkJson({
    formatVersion: 1,
    exportedAt: now,
    settings: {},
    collections: [],
    bookmarks: [{ ...bookmark, collectionId: 'missing' }],
    tombstones: [],
  })).toThrow('Dangling bookmark collection');
  expect(() => parseOpenBookmarkJson({
    formatVersion: 1,
    exportedAt: now,
    settings: {},
    collections: [collection],
    bookmarks: [{ ...bookmark, title: undefined }],
    tombstones: [],
  })).toThrow('Missing title');
  expect(() => parseOpenBookmarkJson({ formatVersion: 1, exportedAt: now, settings: {}, collections: [], bookmarks: [] })).toThrow('Missing data arrays');
});

test('drops private unknown fields during JSON validation', () => {
  const parsed = parseOpenBookmarkJson({
    formatVersion: 1,
    exportedAt: now,
    settings: {},
    collections: [{ ...collection, password: 'secret' }],
    bookmarks: [{ ...bookmark, derivedKey: 'secret', thumbnailCache: 'bytes' }],
    tombstones: [{ ...tombstone, private: 'secret' }],
  });

  expect(JSON.stringify(parsed)).not.toContain('secret');
});

test('export writes only canonical JSON fields', () => {
  const exported = exportOpenBookmarkJson(
    [{ ...collection, password: 'secret' } as Collection],
    [{ ...bookmark, derivedKey: 'secret' } as Bookmark],
    [{ ...tombstone, private: 'secret' } as DeletionMarker],
    { locale: 'zh', managerPreferences: { sort: 'title', password: 'secret' } },
  );

  const text = JSON.stringify(exported);
  expect(text).not.toContain('secret');
  expect(exported.settings).toEqual({
    locale: 'zh',
    managerPreferences: {
      sort: 'title',
      view: 'list',
      collectionFilter: null,
      tagFilter: null,
      favoriteOnly: false,
      unreadOnly: false,
    },
  });
});
