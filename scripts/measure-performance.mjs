import { performance } from 'node:perf_hooks';

function generate(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `perf-${index}`,
    url: `https://example.com/${index}`,
    title: `Bookmark ${String(index).padStart(6, '0')}`,
    description: `Deterministic fixture ${index % 97}`,
    note: index % 5 === 0 ? 'review later' : '',
    collectionId: `collection-${index % 100}`,
    tags: [`tag-${index % 50}`],
  }));
}

function filter(bookmarks, query, collectionId) {
  const normalizedQuery = query.toLocaleLowerCase();
  return bookmarks.filter((bookmark) =>
    (!collectionId || bookmark.collectionId === collectionId)
    && (!normalizedQuery || `${bookmark.title}\n${bookmark.url}\n${bookmark.description}\n${bookmark.note}\n${bookmark.tags.join('\n')}`.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

const bookmarks = generate(100_000);
const startedAt = performance.now();
const result = filter(bookmarks, 'Bookmark 000123', 'collection-23');
const elapsed = performance.now() - startedAt;

console.log(JSON.stringify({ bookmarks: bookmarks.length, resultCount: result.length, searchFilterMs: Number(elapsed.toFixed(2)) }, null, 2));
