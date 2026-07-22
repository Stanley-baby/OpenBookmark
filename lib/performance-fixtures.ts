import type { Bookmark } from './bookmarks';

export function generateDeterministicBookmarks(count: number, now = '2026-07-22T00:00:00.000Z'): Bookmark[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `perf-${index}`,
    url: `https://example.com/${index}`,
    normalizedUrl: `https://example.com/${index}`,
    title: `Bookmark ${String(index).padStart(6, '0')}`,
    description: `Deterministic fixture ${index % 97}`,
    coverUrl: '',
    note: index % 5 === 0 ? 'review later' : '',
    favorite: index % 11 === 0,
    unread: index % 7 === 0,
    collectionId: `collection-${index % 100}`,
    tags: [`tag-${index % 50}`],
    trashedAt: null,
    originalCollectionId: null,
    metadataError: null,
    createdAt: now,
    updatedAt: now,
  }));
}

export function filterPerformanceBookmarks(bookmarks: Bookmark[], query: string, collectionId: string | null) {
  const normalizedQuery = query.toLocaleLowerCase();
  return bookmarks.filter((bookmark) =>
    (!collectionId || bookmark.collectionId === collectionId)
    && (!normalizedQuery || `${bookmark.title}\n${bookmark.url}\n${bookmark.description}\n${bookmark.note}\n${bookmark.tags.join('\n')}`.toLocaleLowerCase().includes(normalizedQuery)),
  );
}
