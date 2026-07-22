import type { Bookmark, Collection } from './bookmarks';

export interface BrowserHtmlBookmark {
  title: string;
  url: string;
  addDate: string | null;
  lastModified: string | null;
  path: string[];
}

export interface BrowserHtmlResult {
  bookmarks: BrowserHtmlBookmark[];
  skipped: string[];
}

const pathSeparator = '\0';

interface ParseState extends BrowserHtmlResult {
  path: string[];
  pendingCollection: string | null;
}

function decodeHtml(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    if (body.startsWith('#')) return String.fromCodePoint(Number(body[1]?.toLowerCase() === 'x' ? `0x${body.slice(2)}` : body.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }[body.toLowerCase()] ?? entity;
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, 'i'));
  return match ? decodeHtml(match[2] ?? '') : null;
}

function textFromTag(line: string, tag: 'A' | 'H3') {
  const match = line.match(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, 'i'));
  return match ? decodeHtml((match[1] ?? '').replace(/<[^>]+>/g, '').trim()) : '';
}

function parseHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function initialParseState(): ParseState {
  return { bookmarks: [], skipped: [], path: [], pendingCollection: null };
}

function parseLine(state: ParseState, rawLine: string, index: number) {
  const line = rawLine.trim();
  const collectionTag = line.match(/<H3\b[^>]*>/i)?.[0];
  const linkTag = line.match(/<A\b[^>]*>/i)?.[0];

  if (collectionTag) state.pendingCollection = textFromTag(line, 'H3') || null;
  if (/<DL\b/i.test(line)) {
    if (state.pendingCollection) state.path.push(state.pendingCollection);
    state.pendingCollection = null;
  }
  if (linkTag) {
    const url = attr(linkTag, 'HREF');
    const title = textFromTag(line, 'A');
    const parsedUrl = parseHttpUrl(url);
    if (parsedUrl && title) {
      state.bookmarks.push({
        title,
        url: parsedUrl,
        addDate: attr(linkTag, 'ADD_DATE'),
        lastModified: attr(linkTag, 'LAST_MODIFIED'),
        path: [...state.path],
      });
    } else {
      state.skipped.push(`line ${index + 1}: missing title or valid URL`);
    }
  }
  if (/<\/DL>/i.test(line) && state.path.length) state.path.pop();
}

export function parseBrowserBookmarksHtml(html: string): BrowserHtmlResult {
  const state = initialParseState();
  for (const [index, rawLine] of html.split(/\r?\n/).entries()) {
    parseLine(state, rawLine, index);
  }
  return { bookmarks: state.bookmarks, skipped: state.skipped };
}

export async function parseBrowserBookmarksHtmlInBatches(html: string, onProgress: (processedLines: number) => void) {
  const state = initialParseState();
  let lineStart = 0;
  let lineIndex = 0;
  while (lineStart <= html.length) {
    const lineEnd = html.indexOf('\n', lineStart);
    const rawLine = html.slice(lineStart, lineEnd === -1 ? html.length : lineEnd).replace(/\r$/, '');
    parseLine(state, rawLine, lineIndex);
    lineIndex += 1;
    if (lineIndex % 500 === 0) {
      onProgress(lineIndex);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  onProgress(lineIndex);
  return { bookmarks: state.bookmarks, skipped: state.skipped };
}

export async function parseBrowserBookmarksHtmlFile(file: Blob, onProgress: (processedLines: number) => void) {
  const state = initialParseState();
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  let lineIndex = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += value;
    while (true) {
      const lineEnd = pending.indexOf('\n');
      if (lineEnd === -1) break;
      parseLine(state, pending.slice(0, lineEnd).replace(/\r$/, ''), lineIndex);
      pending = pending.slice(lineEnd + 1);
      lineIndex += 1;
      if (lineIndex % 500 === 0) {
        onProgress(lineIndex);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  if (pending) {
    parseLine(state, pending.replace(/\r$/, ''), lineIndex);
    lineIndex += 1;
  }
  onProgress(lineIndex);
  return { bookmarks: state.bookmarks, skipped: state.skipped };
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

export function serializeBrowserBookmarksHtml(collections: Collection[], bookmarks: Bookmark[]) {
  return serializeBrowserBookmarksHtmlWithYield(collections, bookmarks).html;
}

function buildExportIndexes(collections: Collection[], bookmarks: Bookmark[]) {
  const children = new Map<string | null, Collection[]>();
  for (const collection of collections) {
    children.set(collection.parentId, [...(children.get(collection.parentId) ?? []), collection]);
  }
  for (const value of children.values()) value.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

  const byCollection = new Map<string | null, Bookmark[]>();
  for (const bookmark of bookmarks) {
    byCollection.set(bookmark.collectionId, [...(byCollection.get(bookmark.collectionId) ?? []), bookmark]);
  }
  for (const value of byCollection.values()) value.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
  return { byCollection, children };
}

function serializeBrowserBookmarksHtmlWithYield(collections: Collection[], bookmarks: Bookmark[]) {
  const { byCollection, children } = buildExportIndexes(collections, bookmarks);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  const appendBookmark = (bookmark: Bookmark, depth: number) => {
    const indent = '    '.repeat(depth);
    lines.push(`${indent}<DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${timestamp(bookmark.createdAt)}" LAST_MODIFIED="${timestamp(bookmark.updatedAt)}">${escapeHtml(bookmark.title)}</A>`);
  };
  const appendCollection = (parentId: string | null, depth: number) => {
    for (const bookmark of byCollection.get(parentId) ?? []) appendBookmark(bookmark, depth);
    for (const collection of children.get(parentId) ?? []) {
      const indent = '    '.repeat(depth);
      lines.push(`${indent}<DT><H3 ADD_DATE="${timestamp(collection.createdAt)}" LAST_MODIFIED="${timestamp(collection.updatedAt)}">${escapeHtml(collection.title)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      appendCollection(collection.id, depth + 1);
      lines.push(`${indent}</DL><p>`);
    }
  };

  appendCollection(null, 1);
  lines.push('</DL><p>');
  return { html: `${lines.join('\n')}\n`, processed: bookmarks.length };
}

export async function serializeBrowserBookmarksHtmlInBatches(collections: Collection[], bookmarks: Bookmark[], onProgress: (processed: number, total: number) => void) {
  onProgress(0, bookmarks.length);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const { byCollection, children } = buildExportIndexes(collections, bookmarks);
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  let processed = 0;
  const appendBookmark = async (bookmark: Bookmark, depth: number) => {
    const indent = '    '.repeat(depth);
    lines.push(`${indent}<DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${timestamp(bookmark.createdAt)}" LAST_MODIFIED="${timestamp(bookmark.updatedAt)}">${escapeHtml(bookmark.title)}</A>`);
    processed += 1;
    if (processed % 500 === 0) {
      onProgress(processed, bookmarks.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const appendCollection = async (parentId: string | null, depth: number) => {
    for (const bookmark of byCollection.get(parentId) ?? []) await appendBookmark(bookmark, depth);
    for (const collection of children.get(parentId) ?? []) {
      const indent = '    '.repeat(depth);
      lines.push(`${indent}<DT><H3 ADD_DATE="${timestamp(collection.createdAt)}" LAST_MODIFIED="${timestamp(collection.updatedAt)}">${escapeHtml(collection.title)}</H3>`);
      lines.push(`${indent}<DL><p>`);
      await appendCollection(collection.id, depth + 1);
      lines.push(`${indent}</DL><p>`);
    }
  };

  await appendCollection(null, 1);
  lines.push('</DL><p>');
  onProgress(processed, bookmarks.length);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return `${lines.join('\n')}\n`;
}

export function pathKey(path: string[]) {
  return path.join(pathSeparator);
}
