import { expect, test } from '@playwright/test';
import { filterPerformanceBookmarks, generateDeterministicBookmarks } from '../lib/performance-fixtures';

test('generates deterministic large-data fixtures and exercises the same search/filter shape', () => {
  const bookmarks = generateDeterministicBookmarks(100_000);
  const startedAt = performance.now();
  const result = filterPerformanceBookmarks(bookmarks, 'Bookmark 000123', 'collection-23');
  const elapsed = performance.now() - startedAt;

  expect(result).toHaveLength(1);
  expect(result[0]?.id).toBe('perf-123');
  expect(elapsed).toBeLessThan(200);
});
