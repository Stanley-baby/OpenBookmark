import { test, expect } from '@playwright/test';
import { normalizeBookmarkUrl } from '../lib/urls';

test('normalizes only unambiguous URL parts', () => {
  expect(normalizeBookmarkUrl('HTTPS://Example.COM:443')).toBe('https://example.com/');
  expect(normalizeBookmarkUrl('http://Example.COM:80/articles/1?view=full#notes')).toBe(
    'http://example.com/articles/1?view=full#notes',
  );
  expect(normalizeBookmarkUrl('https://example.com/?page=1')).not.toBe(
    normalizeBookmarkUrl('https://example.com/?page=2'),
  );
});
