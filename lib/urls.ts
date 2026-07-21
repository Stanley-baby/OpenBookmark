export function normalizeBookmarkUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Bookmark URL must use HTTP or HTTPS');
  }
  return url.href;
}
