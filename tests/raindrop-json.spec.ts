import { expect, test } from '@playwright/test';
import { normalizeBookmarkUrl } from '../lib/urls';
import { planRaindropJsonImport } from '../lib/raindrop-json';

test('maps representative Raindrop JSON into OpenBookmark fields', () => {
  const plan = planRaindropJsonImport({
    collections: [
      { _id: 1, title: 'Work' },
      { _id: 2, title: 'Nested', parent: { $id: 1 } },
    ],
    items: [{
      link: 'https://example.com/article',
      title: 'Article',
      excerpt: 'Summary',
      note: 'Private note',
      cover: 'https://example.com/cover.jpg',
      collection: { $id: 2 },
      tags: ['research'],
      important: true,
      unread: true,
      created: '2026-07-20T00:00:00.000Z',
      lastUpdate: '2026-07-21T00:00:00.000Z',
    }],
  });

  expect(plan.items).toHaveLength(1);
  expect(plan.items[0]).toMatchObject({
    collectionPath: ['Work', 'Nested'],
    bookmark: {
      url: 'https://example.com/article',
      title: 'Article',
      description: 'Summary',
      note: 'Private note',
      coverUrl: 'https://example.com/cover.jpg',
      tags: ['research'],
      favorite: true,
      unread: true,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
  });
});

test('reports duplicates, unknown fields, and damaged Raindrop rows', () => {
  const plan = planRaindropJsonImport({
    items: [
      { link: 'https://example.com/a', title: 'A', mystery: 'ignored' },
      { link: 'https://example.com/a?x=1', title: 'Not duplicate', collectionId: 'inbox' },
      { link: 'notaurl', title: 'Broken' },
      { title: 'Missing link', damagedMystery: 'ignored' },
    ],
  }, new Set([normalizeBookmarkUrl('https://example.com/a')]));

  expect(plan.items.map((item) => item.bookmark.title)).toEqual(['Not duplicate']);
  expect(plan.duplicates).toBe(1);
  expect(plan.skipped).toBe(2);
  expect(plan.unknownFields).toEqual(['damagedMystery', 'mystery']);
});
