import { expect, test } from '@playwright/test';
import { parseBrowserBookmarksHtml, serializeBrowserBookmarksHtml } from '../lib/browser-html';
import type { Bookmark, Collection } from '../lib/bookmarks';

test('parses representative browser bookmark HTML and reports damaged items', () => {
  const result = parseBrowserBookmarksHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000">Work &amp; Research</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a" ADD_DATE="1700000001" LAST_MODIFIED="1700000002">Alpha</A>
    <DT><A ADD_DATE="1700000003">Broken</A>
    <DT><A HREF="notaurl">Bad URL</A>
    <DT><H3>Nested</H3>
    <DL><p>
      <DT><A HREF="https://example.com/b">Beta &lt;B&gt;</A>
    </DL><p>
  </DL><p>
</DL><p>`);

  expect(result.bookmarks).toEqual([
    { title: 'Alpha', url: 'https://example.com/a', addDate: '1700000001', lastModified: '1700000002', path: ['Work & Research'] },
    { title: 'Beta <B>', url: 'https://example.com/b', addDate: null, lastModified: null, path: ['Work & Research', 'Nested'] },
  ]);
  expect(result.skipped).toEqual(['line 6: missing title or valid URL', 'line 7: missing title or valid URL']);
});

test('exports browser bookmark HTML that parses back with hierarchy intact', () => {
  const now = '2026-07-22T00:00:00.000Z';
  const collections: Collection[] = [
    { id: 'work', title: 'Work', parentId: null, position: 0, createdAt: now, updatedAt: now },
    { id: 'nested', title: 'Nested', parentId: 'work', position: 0, createdAt: now, updatedAt: now },
  ];
  const bookmark = (id: string, title: string, url: string, collectionId: string | null): Bookmark => ({
    id,
    title,
    url,
    normalizedUrl: url,
    description: '',
    coverUrl: '',
    note: '',
    favorite: false,
    unread: false,
    collectionId,
    tags: [],
    trashedAt: null,
    originalCollectionId: null,
    metadataError: null,
    createdAt: now,
    updatedAt: now,
  });

  const parsed = parseBrowserBookmarksHtml(serializeBrowserBookmarksHtml(collections, [
    bookmark('a', 'Root', 'https://example.com/root', null),
    bookmark('b', 'Child', 'https://example.com/child', 'nested'),
  ]));

  expect(parsed.bookmarks.map(({ title, url, path }) => ({ title, url, path }))).toEqual([
    { title: 'Root', url: 'https://example.com/root', path: [] },
    { title: 'Child', url: 'https://example.com/child', path: ['Work', 'Nested'] },
  ]);
});
