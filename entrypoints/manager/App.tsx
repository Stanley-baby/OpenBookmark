import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  bookmarkRepository,
  collectionDescendantIds,
  collectionPath,
  collectionRepository,
  trashCleanupErrorKey,
  type Bookmark,
  type Collection,
} from '../../lib/bookmarks';
import { type Locale, useI18n } from '../../lib/i18n';
import { readDocumentMetadata } from '../../lib/metadata';
import { parseBrowserBookmarksHtmlFile, pathKey, serializeBrowserBookmarksHtmlInBatches, type BrowserHtmlBookmark } from '../../lib/browser-html';
import { exportOpenBookmarkJson, parseOpenBookmarkJson } from '../../lib/openbookmark-json';
import { planRaindropJsonImport } from '../../lib/raindrop-json';
import { ThumbnailCache, thumbnailPlaceholder } from '../../lib/thumbnail-cache';
import { indexedDbThumbnailStore } from '../../lib/thumbnail-cache-db';
import { backupScheduleKey, canUseWebDav, defaultBackupSchedule, restoreProtectionSnapshotKey, sanitizeWebDavSettings, webDavSettingsKey } from '../../lib/backup-settings';
import { markAutomaticBackupFinished } from '../../lib/backup-scheduler';
import { summarizeRestore } from '../../lib/backup-restore';
import { enforceBackupRetention, parseBackup, uploadBackup, WebDavBackupClient, type BackupVersion, type WebDavSettings } from '../../lib/webdav-backup';

type SortMode = 'newest' | 'oldest' | 'title';
type ViewMode = 'list' | 'card';

interface ManagerPreferences {
  sort: SortMode;
  view: ViewMode;
  collectionFilter: string | null;
  tagFilter: string | null;
  favoriteOnly: boolean;
  unreadOnly: boolean;
}

const preferencesKey = 'managerPreferences';
const thumbnailCache = new ThumbnailCache(indexedDbThumbnailStore);

function ThumbnailCover({ coverUrl, title }: { coverUrl: string; title: string }) {
  const [src, setSrc] = useState(thumbnailPlaceholder);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void thumbnailCache.getCached(coverUrl).then((url) => {
      objectUrl = url.startsWith('blob:') ? url : '';
      if (active) setSrc(url);
      else if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverUrl]);

  return <img className="thumbnail" src={src} alt={coverUrl ? title : ''} />;
}

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [trashedBookmarks, setTrashedBookmarks] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>('newest');
  const [view, setView] = useState<ViewMode>('list');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showUnsorted, setShowUnsorted] = useState(false);
  const [collapsedCollectionIds, setCollapsedCollectionIds] = useState<Set<string>>(new Set());
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managerStatus, setManagerStatus] = useState('');
  const [trashCleanupFailed, setTrashCleanupFailed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState('');
  const [bulkCollectionId, setBulkCollectionId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [webDavSettings, setWebDavSettings] = useState<WebDavSettings>(sanitizeWebDavSettings(null));
  const [backupVersions, setBackupVersions] = useState<BackupVersion[]>([]);
  const [restorePassword, setRestorePassword] = useState('');
  const refreshCancelRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const importCancelRef = useRef(false);
  const collectionLabels = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collectionPath(collection, collections)])),
    [collections],
  );
  const descendantsByCollection = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collectionDescendantIds(collection.id, collections)])),
    [collections],
  );
  const collectionDepths = useMemo(() => {
    const byId = new Map(collections.map((collection) => [collection.id, collection]));
    return new Map(collections.map((collection) => {
      let depth = 0;
      let parent = collection.parentId ? byId.get(collection.parentId) : undefined;
      while (parent) {
        depth += 1;
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return [collection.id, depth];
    }));
  }, [collections]);
  const collectionBookmarkCounts = useMemo(() => new Map(collections.map((collection) => {
    const ids = descendantsByCollection.get(collection.id)!;
    return [collection.id, bookmarks.filter((bookmark) => bookmark.collectionId === collection.id || ids.has(bookmark.collectionId ?? '')).length];
  })), [bookmarks, collections, descendantsByCollection]);

  useEffect(() => {
    const bookmarkSubscription = bookmarkRepository.watch().subscribe({ next: setBookmarks, error: () => setFailed(true) });
    const trashSubscription = bookmarkRepository.watchTrash().subscribe({ next: setTrashedBookmarks, error: () => setFailed(true) });
    const collectionSubscription = collectionRepository.watch().subscribe({ next: setCollections, error: () => setFailed(true) });
    return () => {
      bookmarkSubscription.unsubscribe();
      trashSubscription.unsubscribe();
      collectionSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void browser.storage.local.get(trashCleanupErrorKey).then((result) => setTrashCleanupFailed(Boolean(result[trashCleanupErrorKey])));
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName === 'local' && trashCleanupErrorKey in changes) {
        setTrashCleanupFailed(Boolean(changes[trashCleanupErrorKey].newValue));
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(preferencesKey).then((result) => {
      if (!active) return;
      const preferences = result[preferencesKey] as Partial<ManagerPreferences> | undefined;
      if (preferences?.sort === 'newest' || preferences?.sort === 'oldest' || preferences?.sort === 'title') setSort(preferences.sort);
      if (preferences?.view === 'list' || preferences?.view === 'card') setView(preferences.view);
      setCollectionFilter(typeof preferences?.collectionFilter === 'string' ? preferences.collectionFilter : null);
      setTagFilter(typeof preferences?.tagFilter === 'string' ? preferences.tagFilter : null);
      setFavoriteOnly(preferences?.favoriteOnly === true);
      setUnreadOnly(preferences?.unreadOnly === true);
      setPreferencesLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const preferences: ManagerPreferences = { sort, view, collectionFilter, tagFilter, favoriteOnly, unreadOnly };
    void browser.storage.local.set({ [preferencesKey]: preferences });
  }, [collectionFilter, favoriteOnly, preferencesLoaded, sort, tagFilter, unreadOnly, view]);

  useEffect(() => {
    void browser.storage.local.get(webDavSettingsKey).then((result) => {
      setWebDavSettings(sanitizeWebDavSettings(result[webDavSettingsKey]));
    });
  }, []);

  const visibleBookmarks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = bookmarks.filter((bookmark) => {
      const searchableText = [bookmark.title, bookmark.url, bookmark.description, bookmark.note, ...bookmark.tags]
        .join('\n')
        .toLocaleLowerCase();
      return (!query || searchableText.includes(query))
        && (!collectionFilter || bookmark.collectionId === collectionFilter)
        && (!showUnsorted || bookmark.collectionId === null)
        && (!tagFilter || bookmark.tags.includes(tagFilter))
        && (!favoriteOnly || bookmark.favorite)
        && (!unreadOnly || bookmark.unread);
    });
    return filtered.sort((a, b) => {
      const byId = a.id.localeCompare(b.id);
      if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt) || byId;
      if (sort === 'title') {
        return a.title.localeCompare(b.title, locale === 'zh' ? 'zh-CN' : 'en', { sensitivity: 'base' })
          || a.createdAt.localeCompare(b.createdAt)
          || byId;
      }
      return b.createdAt.localeCompare(a.createdAt) || byId;
    });
  }, [bookmarks, collectionFilter, favoriteOnly, locale, search, showUnsorted, sort, tagFilter, unreadOnly]);
  const tags = useMemo(() => [...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))].sort(), [bookmarks]);
  const dateFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  const selectedVisibleIds = useMemo(() => visibleBookmarks.filter((bookmark) => selectedIds.has(bookmark.id)).map((bookmark) => bookmark.id), [selectedIds, visibleBookmarks]);
  const selectedBookmark = useMemo(
    () => visibleBookmarks.find((bookmark) => bookmark.id === selectedBookmarkId) ?? null,
    [selectedBookmarkId, visibleBookmarks],
  );

  useEffect(() => {
    setSelectedIds(new Set());
  }, [collectionFilter, favoriteOnly, search, showTrash, showUnsorted, tagFilter, unreadOnly]);

  useEffect(() => {
    if (visibleBookmarks.some((bookmark) => bookmark.id === selectedBookmarkId)) return;
    setSelectedBookmarkId(visibleBookmarks[0]?.id ?? null);
  }, [selectedBookmarkId, visibleBookmarks]);

  async function createCollection(form: HTMLFormElement) {
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    if (!title) return;
    await collectionRepository.create(title, String(data.get('parentId') || '') || null);
    form.reset();
  }

  async function renameCollection(collection: Collection) {
    const title = prompt(t('renameCollectionPrompt'), collection.title)?.trim();
    if (title) await collectionRepository.rename(collection.id, title);
  }

  async function deleteCollection(collection: Collection) {
    const impact = await collectionRepository.deleteImpact(collection.id);
    const message = t('deleteImpact', { title: collection.title, bookmarks: impact.bookmarks, children: impact.children });
    if (!confirm(message)) return;
    await collectionRepository.delete(collection.id);
    if (collectionFilter === collection.id) setCollectionFilter(null);
  }

  function clearFilters() {
    setSearch('');
    setCollectionFilter(null);
    setShowUnsorted(false);
    setTagFilter(null);
    setFavoriteOnly(false);
    setUnreadOnly(false);
  }

  function toggleSelected(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectVisible(selected: boolean) {
    setSelectedIds(selected ? new Set(visibleBookmarks.map((bookmark) => bookmark.id)) : new Set());
  }

  async function applyBulk(action: 'collection' | 'addTags' | 'removeTags' | 'favorite' | 'notFavorite' | 'unread' | 'read' | 'trash') {
    const ids = selectedVisibleIds;
    if (!ids.length) return;
    if (action === 'collection') await bookmarkRepository.bulkSetCollection(ids, bulkCollectionId || null);
    if (action === 'addTags') await bookmarkRepository.bulkAddTags(ids, bulkTags.split(','));
    if (action === 'removeTags') await bookmarkRepository.bulkRemoveTags(ids, bulkTags.split(','));
    if (action === 'favorite') await bookmarkRepository.bulkSetFavorite(ids, true);
    if (action === 'notFavorite') await bookmarkRepository.bulkSetFavorite(ids, false);
    if (action === 'unread') await bookmarkRepository.bulkSetUnread(ids, true);
    if (action === 'read') await bookmarkRepository.bulkSetUnread(ids, false);
    if (action === 'trash') {
      await bookmarkRepository.bulkMoveToTrash(ids);
      setManagerStatus(t('bulkMovedToTrash', { count: ids.length }));
    }
    setSelectedIds(new Set());
  }

  async function refreshSelectedMetadata() {
    const ids = selectedVisibleIds;
    if (!ids.length || refreshing) return;
    setRefreshing(true);
    refreshCancelRef.current = false;
    let done = 0;
    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
      if (refreshCancelRef.current) break;
      const bookmark = bookmarks.find((item) => item.id === id);
      if (!bookmark) continue;
      const controller = new AbortController();
      refreshAbortRef.current = controller;
      try {
        const response = await fetch(bookmark.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const metadata = readDocumentMetadata(parsed, bookmark.url);
        if (!metadata.title.trim()) throw new Error('No readable metadata');
        await bookmarkRepository.updateMetadata(id, metadata);
        succeeded += 1;
      } catch (error) {
        if (refreshCancelRef.current) break;
        failed += 1;
        await bookmarkRepository.markMetadataRefreshFailed(id, error instanceof Error ? error.message : String(error));
      } finally {
        refreshAbortRef.current = null;
      }
      done += 1;
      setManagerStatus(t('refreshProgress', { done, total: ids.length, succeeded, failed }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setManagerStatus(t(refreshCancelRef.current ? 'refreshCanceled' : 'refreshProgress', { done, total: ids.length, succeeded, failed }));
    setRefreshing(false);
    setSelectedIds(new Set());
  }

  async function moveToTrash(bookmark: Bookmark) {
    await bookmarkRepository.moveToTrash(bookmark.id);
    if (selectedBookmarkId === bookmark.id) setSelectedBookmarkId(null);
    setManagerStatus(t('movedToTrash', { title: bookmark.title }));
  }

  async function saveInspector(form: HTMLFormElement) {
    if (!selectedBookmark) return;
    const data = new FormData(form);
    await bookmarkRepository.save({
      id: selectedBookmark.id,
      url: String(data.get('url') ?? '').trim(),
      title: String(data.get('title') ?? '').trim() || selectedBookmark.title,
      description: String(data.get('description') ?? ''),
      coverUrl: String(data.get('coverUrl') ?? ''),
      note: String(data.get('note') ?? ''),
      favorite: data.get('favorite') === 'on',
      unread: data.get('unread') === 'on',
      collectionId: String(data.get('collectionId') ?? '') || null,
      tags: String(data.get('tags') ?? '').split(','),
    });
    setManagerStatus(locale === 'zh' ? '书签已保存。' : 'Bookmark saved.');
  }

  async function restoreBookmark(bookmark: Bookmark) {
    const result = await bookmarkRepository.restore(bookmark.id);
    setManagerStatus(result.duplicate
      ? t('restoreDuplicate')
      : result.restoredToUnsorted
        ? t('restoredToUnsorted')
        : t('restoredBookmark', { title: bookmark.title }));
  }

  async function permanentlyDelete(bookmark: Bookmark) {
    if (!confirm(t('confirmPermanentDelete', { title: bookmark.title }))) return;
    await bookmarkRepository.permanentlyDelete(bookmark.id);
    setManagerStatus(t('permanentlyDeleted', { title: bookmark.title }));
  }

  async function emptyTrash() {
    if (!confirm(t('confirmEmptyTrash', { count: trashedBookmarks.length }))) return;
    await bookmarkRepository.emptyTrash();
    setManagerStatus(t('emptiedTrash'));
  }

  function importedDate(seconds: string | null) {
    if (!seconds) return undefined;
    const value = Number(seconds);
    return Number.isFinite(value) ? new Date(value * 1000).toISOString() : undefined;
  }

  function collectionTitlePath(collection: Collection, allCollections: Collection[]) {
    const byId = new Map(allCollections.map((item) => [item.id, item]));
    const titles = [collection.title];
    let parent = collection.parentId ? byId.get(collection.parentId) : undefined;
    while (parent) {
      titles.unshift(parent.title);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return titles;
  }

  async function collectionForImportPath(importedPath: string[]) {
    const currentCollections = await collectionRepository.list();
    const idsByPath = new Map<string, string>();
    const addExisting = (collection: Collection) => {
      idsByPath.set(pathKey(collectionTitlePath(collection, currentCollections)), collection.id);
    };
    currentCollections.forEach(addExisting);

    let parentId: string | null = null;
    const path: string[] = [];
    for (const title of importedPath) {
      path.push(title);
      const key = pathKey(path);
      let id = idsByPath.get(key);
      if (!id) {
        id = await collectionRepository.create(title, parentId);
        idsByPath.set(key, id);
      }
      parentId = id;
    }
    return parentId;
  }

  async function importBrowserHtmlBookmark(bookmark: BrowserHtmlBookmark) {
    await bookmarkRepository.save({
      url: bookmark.url,
      title: bookmark.title,
      description: '',
      coverUrl: '',
      note: '',
      favorite: false,
      unread: false,
      collectionId: await collectionForImportPath(bookmark.path),
      tags: [],
      createdAt: importedDate(bookmark.addDate),
      updatedAt: importedDate(bookmark.lastModified),
    });
  }

  async function importPlannedBookmark(item: { bookmark: Parameters<typeof bookmarkRepository.save>[0]; collectionPath: string[] }) {
    await bookmarkRepository.save({
      ...item.bookmark,
      collectionId: await collectionForImportPath(item.collectionPath),
    });
  }

  async function importBrowserHtml(file: File | undefined) {
    if (!file || importing) return;
    setImporting(true);
    importCancelRef.current = false;
    try {
      const parsed = await parseBrowserBookmarksHtmlFile(file, (processed) => {
        setManagerStatus(t('browserImportParsing', { processed }));
      });
      let imported = 0;
      let skipped = parsed.skipped.length;
      for (const bookmark of parsed.bookmarks) {
        if (importCancelRef.current) break;
        try {
        await importBrowserHtmlBookmark(bookmark);
          imported += 1;
        } catch {
          skipped += 1;
        }
        setManagerStatus(t('browserImportProgress', { imported, total: parsed.bookmarks.length, skipped }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setManagerStatus(t(importCancelRef.current ? 'browserImportCanceled' : 'browserImportDone', {
        imported,
        total: parsed.bookmarks.length,
        skipped,
      }));
    } catch {
      setManagerStatus(t('browserImportFailed'));
    } finally {
      setImporting(false);
    }
  }

  async function restoreOpenBookmarkJson(file: File | undefined) {
    if (!file) return;
    try {
      const data = parseOpenBookmarkJson(JSON.parse(await file.text()));
      if (!confirm(t('confirmJsonRestore', { bookmarks: data.bookmarks.length, collections: data.collections.length }))) return;
      await bookmarkRepository.restoreBackup(data.bookmarks, data.collections, data.tombstones);
      await browser.storage.local.set({
        locale: data.settings.locale,
        managerPreferences: data.settings.managerPreferences,
      });
      setManagerStatus(t('jsonRestoreDone', { bookmarks: data.bookmarks.length, collections: data.collections.length }));
    } catch (error) {
      setManagerStatus(t('jsonRestoreFailed', { reason: error instanceof Error ? error.message : 'Invalid JSON' }));
    }
  }

  async function importRaindropJson(file: File | undefined) {
    if (!file) return;
    try {
      const plan = planRaindropJsonImport(JSON.parse(await file.text()), new Set(bookmarks.map((bookmark) => bookmark.normalizedUrl)));
      if (!confirm(t('confirmRaindropImport', {
        imported: plan.items.length,
        skipped: plan.skipped,
        duplicates: plan.duplicates,
        unknown: plan.unknownFields.join(', ') || t('none'),
      }))) return;
      for (const item of plan.items) await importPlannedBookmark(item);
      setManagerStatus(t('raindropImportDone', {
        imported: plan.items.length,
        skipped: plan.skipped,
        duplicates: plan.duplicates,
        unknown: plan.unknownFields.join(', ') || t('none'),
      }));
    } catch (error) {
      setManagerStatus(t('raindropImportFailed', { reason: error instanceof Error ? error.message : 'Invalid JSON' }));
    }
  }

  async function exportOpenBookmarkData() {
    try {
      const allBookmarks = await bookmarkRepository.listAll();
      const tombstones = await bookmarkRepository.listTombstones();
      const stored = await browser.storage.local.get(['locale', 'managerPreferences']);
      const json = JSON.stringify(exportOpenBookmarkJson(collections, allBookmarks, tombstones, {
        locale: stored.locale === 'en' || stored.locale === 'zh' ? stored.locale : null,
        managerPreferences: stored.managerPreferences ?? null,
      }), null, 2);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      link.download = 'openbookmark-data.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 0);
      setManagerStatus(t('jsonExportDone', { bookmarks: allBookmarks.length, collections: collections.length }));
    } catch (error) {
      setManagerStatus(t('jsonExportFailed', { reason: error instanceof Error ? error.message : 'Could not create download' }));
    }
  }

  async function exportBrowserHtml() {
    try {
      const html = await serializeBrowserBookmarksHtmlInBatches(collections, bookmarks, (processed, total) => {
        setManagerStatus(t('browserExportProgress', { processed, total }));
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      link.download = 'openbookmark-bookmarks.html';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 0);
      setManagerStatus(t('browserExportDone', { count: bookmarks.length }));
    } catch (error) {
      setManagerStatus(t('browserExportFailed', { reason: error instanceof Error ? error.message : 'Could not create download' }));
    }
  }

  async function currentBackupData() {
    const allBookmarks = await bookmarkRepository.listAll();
    const tombstones = await bookmarkRepository.listTombstones();
    const stored = await browser.storage.local.get(['locale', 'managerPreferences']);
    const storedLocale: 'en' | 'zh' | null = stored.locale === 'en' || stored.locale === 'zh' ? stored.locale : null;
    return {
      collections,
      bookmarks: allBookmarks,
      tombstones,
      settings: {
        locale: storedLocale,
        managerPreferences: stored.managerPreferences ?? null,
      },
    };
  }

  async function saveWebDavSettings(next: WebDavSettings) {
    setWebDavSettings(next);
    await browser.storage.local.set({
      [webDavSettingsKey]: next,
      [backupScheduleKey]: { ...defaultBackupSchedule, autoBackup: next.autoBackup },
    });
    setManagerStatus(t('backupSettingsSaved'));
  }

  async function testWebDavConnection() {
    const result = await new WebDavBackupClient(webDavSettings).testConnection();
    setManagerStatus(t(result === 'ok'
      ? 'webDavConnected'
      : result === 'auth-failed'
        ? 'webDavAuthFailed'
        : result === 'not-writable'
          ? 'webDavNotWritable'
          : 'webDavNetworkFailed'));
  }

  async function listWebDavVersions() {
    try {
      const versions = await new WebDavBackupClient(webDavSettings).listVersions();
      setBackupVersions(versions);
      setManagerStatus(t('backupVersionsLoaded', { count: versions.length }));
    } catch (error) {
      setManagerStatus(t('backupFailed', { reason: error instanceof Error ? error.message : 'Could not list backups' }));
    }
  }

  async function runManualBackup() {
    if (!canUseWebDav(webDavSettings)) {
      setManagerStatus(t('backupSettingsIncomplete'));
      return;
    }
    try {
      const client = new WebDavBackupClient(webDavSettings);
      const version = await uploadBackup(client, await currentBackupData(), webDavSettings);
      const versions = await client.listVersions();
      await enforceBackupRetention(client, versions);
      setBackupVersions(versions.slice(0, 30));
      await browser.storage.local.set({ [backupScheduleKey]: markAutomaticBackupFinished({ ...defaultBackupSchedule, autoBackup: webDavSettings.autoBackup }, Date.now()) });
      setManagerStatus(t('backupDone', { name: version.name, size: version.size }));
    } catch (error) {
      setManagerStatus(t('backupFailed', { reason: error instanceof Error ? error.message : 'Could not create backup' }));
    }
  }

  async function restoreWebDavVersion(version: BackupVersion) {
    try {
      const client = new WebDavBackupClient(webDavSettings);
      const incoming = await parseBackup(await client.downloadVersion(version), restorePassword || webDavSettings.recoveryPassword);
      const current = await currentBackupData();
      const summary = summarizeRestore(current, incoming);
      const message = t('confirmBackupRestore', {
        name: version.name,
        bookmarks: summary.bookmarks,
        collections: summary.collections,
        tombstones: summary.tombstones,
        exportedAt: summary.sourceExportedAt,
        added: summary.addedBookmarks,
        removed: summary.removedBookmarks,
      });
      if (!confirm(message)) return;
      await browser.storage.local.set({ [restoreProtectionSnapshotKey]: exportOpenBookmarkJson(current.collections, current.bookmarks, current.tombstones, current.settings) });
      await bookmarkRepository.restoreBackup(incoming.bookmarks, incoming.collections, incoming.tombstones);
      await browser.storage.local.set({
        locale: incoming.settings.locale,
        managerPreferences: incoming.settings.managerPreferences,
      });
      setManagerStatus(t('backupRestoreDone', { bookmarks: incoming.bookmarks.length, collections: incoming.collections.length }));
    } catch (error) {
      setManagerStatus(t('backupRestoreFailed', { reason: error instanceof Error ? error.message : 'Could not restore backup' }));
    }
  }

  async function clearThumbnailCache() {
    await thumbnailCache.clear();
    setManagerStatus(t('thumbnailCacheCleared'));
  }

  async function regenerateThumbnailCache() {
    let done = 0;
    for (const bookmark of bookmarks.filter((item) => item.coverUrl)) {
      await thumbnailCache.getOrFetch(bookmark.coverUrl);
      done += 1;
      setManagerStatus(t('thumbnailCacheProgress', { done, total: bookmarks.filter((item) => item.coverUrl).length }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setManagerStatus(t('thumbnailCacheDone', { count: done }));
  }

  return (
    <div className="layout">
      <aside className="manager-sidebar">
        <div className="sidebar-account">
          <strong>OpenBookmark</strong>
          <button type="button" aria-label="Focus collection creation" onClick={() => document.querySelector<HTMLInputElement>('.collection-create input')?.focus()}>+</button>
        </div>
        <nav className="system-locations" aria-label={t('collections')}>
          <button type="button" aria-pressed={!showTrash && !showUnsorted && collectionFilter === null} onClick={() => { setShowTrash(false); setShowUnsorted(false); setCollectionFilter(null); }}><span aria-hidden="true">☁</span>{t('allBookmarks')}<em aria-hidden="true">{bookmarks.length}</em></button>
          <button type="button" aria-pressed={!showTrash && showUnsorted} onClick={() => { setShowTrash(false); setShowUnsorted(true); setCollectionFilter(null); }}><span aria-hidden="true">▣</span>{t('unsorted')}<em aria-hidden="true">{bookmarks.filter((bookmark) => bookmark.collectionId === null).length}</em></button>
          <button type="button" aria-pressed={showTrash} onClick={() => { setShowTrash(true); setShowUnsorted(false); }}><span aria-hidden="true">♲</span>{t('trash')}<em aria-hidden="true">{trashedBookmarks.length}</em></button>
        </nav>
        <section className="collections" aria-labelledby="collections-heading">
          <h2 id="collections-heading">{t('collections')}</h2>
          <form className="collection-create" onSubmit={(event) => { event.preventDefault(); void createCollection(event.currentTarget); }}>
            <label>
              {t('newCollectionName')}
              <input name="title" required />
            </label>
            <label>
              {t('parentCollection')}
              <select name="parentId">
                <option value="">{t('unsorted')}</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collectionLabels.get(collection.id)}</option>)}
              </select>
            </label>
            <button type="submit">{t('createCollection')}</button>
          </form>
          <ul className="collection-list">
            {collections.map((collection) => {
              const descendants = descendantsByCollection.get(collection.id)!;
              const hiddenByParent = collections.some((ancestor) => {
                if (!collapsedCollectionIds.has(ancestor.id)) return false;
                return descendantsByCollection.get(ancestor.id)?.has(collection.id);
              });
              const hasChildren = descendants.size > 0;
              if (hiddenByParent) return null;
              return (
                <li key={collection.id} className="collection-item" style={{ '--tree-indent': `${(collectionDepths.get(collection.id) ?? 0) * 16}px` } as CSSProperties}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label={collapsedCollectionIds.has(collection.id) ? `Expand ${collection.title}` : `Collapse ${collection.title}`}
                      onClick={() => setCollapsedCollectionIds((current) => {
                        const next = new Set(current);
                        if (next.has(collection.id)) next.delete(collection.id);
                        else next.add(collection.id);
                        return next;
                      })}
                    >{collapsedCollectionIds.has(collection.id) ? '›' : '⌄'}</button>
                  ) : <span className="tree-spacer" aria-hidden="true" />}
                  <button
                    type="button"
                    data-collection-id={collection.id}
                    className={!showTrash && collectionFilter === collection.id ? 'selected' : ''}
                    aria-pressed={!showTrash && collectionFilter === collection.id}
                    onClick={() => { setShowTrash(false); setShowUnsorted(false); setCollectionFilter(collection.id); }}
                  >
                    {collection.title}
                  </button>
                  <em>{collectionBookmarkCounts.get(collection.id) ?? 0}</em>
                  <label>
                    <select
                      aria-label={t('parentFor', { title: collection.title })}
                      value={collection.parentId ?? ''}
                      onChange={(event) => void collectionRepository.move(collection.id, event.target.value || null)}
                    >
                      <option value="">{t('unsorted')}</option>
                      {collections.map((parent) => (
                        <option key={parent.id} value={parent.id} disabled={parent.id === collection.id || descendants.has(parent.id)}>
                          {collectionLabels.get(parent.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="collection-actions">
                    <button type="button" aria-label={t('moveUp', { title: collection.title })} onClick={() => void collectionRepository.reorder(collection.id, -1)}>↑</button>
                    <button type="button" aria-label={t('moveDown', { title: collection.title })} onClick={() => void collectionRepository.reorder(collection.id, 1)}>↓</button>
                    <button type="button" aria-label={t('renameCollection', { title: collection.title })} onClick={() => void renameCollection(collection)}>✎</button>
                    <button type="button" aria-label={t('deleteCollection', { title: collection.title })} onClick={() => void deleteCollection(collection)}>×</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {tags.length > 0 && (
          <section aria-labelledby="tags-heading">
            <h2 id="tags-heading">{t('tags')}</h2>
            {tagFilter && <button type="button" onClick={() => setTagFilter(null)}>{t('clearFilter')}</button>}
            <div className="tag-list">{tags.map((tag) => <button key={tag} type="button" aria-pressed={!showTrash && tagFilter === tag} onClick={() => { setShowTrash(false); setShowUnsorted(false); setTagFilter(tag); }}>{tag}</button>)}</div>
          </section>
        )}
      </aside>
      <main className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-actions">
            {!showTrash && <button type="button" className="toolbar-add" aria-label="Focus collection creation" onClick={() => document.querySelector<HTMLInputElement>('.collection-create input')?.focus()}>+</button>}
            <button type="button" className="toolbar-icon" aria-label="Open settings" aria-pressed={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}>⚙</button>
            <label className="language">
              {t('language')}
              <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                <option value="en">{t('english')}</option>
                <option value="zh">{t('chinese')}</option>
              </select>
            </label>
          </div>
          {!showTrash && <label className="manager-search">
            <span className="sr-only">{t('searchBookmarks')}</span>
            <input type="search" value={search} placeholder={t('searchBookmarks')} onChange={(event) => setSearch(event.target.value)} />
          </label>}
        </header>

        {!showTrash && <section className="manager-controls" aria-label={t('filters')}>
          <div className="scope-title"><span aria-hidden="true">☁</span><h1>{showUnsorted ? t('unsorted') : t('manager')}</h1></div>
          <label>
            {t('sortBookmarks')}
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="newest">{t('newestFirst')}</option>
              <option value="oldest">{t('oldestFirst')}</option>
              <option value="title">{t('titleAZ')}</option>
            </select>
          </label>
          <div className="view-options" role="group" aria-label={t('view')}>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('listView')}</button>
            <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')}>{t('cardView')}</button>
          </div>
          <fieldset>
            <legend>{t('filtersCombineAnd')}</legend>
            <label><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /> {t('favoriteOnly')}</label>
            <label><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> {t('unreadOnly')}</label>
          </fieldset>
        </section>}
        {!showTrash && settingsOpen && (
          <aside className="settings-drawer" aria-label="Settings">
            <header className="settings-drawer-header">
              <div>
                <span>{locale === 'zh' ? '本地管理' : 'Local management'}</span>
                <h2>{locale === 'zh' ? '设置与备份' : 'Settings and backup'}</h2>
              </div>
              <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
            </header>
          <section className="import-export" aria-label={t('browserImportExport')}>
            <label>
              {t('importBrowserHtml')}
              <input type="file" accept=".html,text/html" disabled={importing} onChange={(event) => void importBrowserHtml(event.currentTarget.files?.[0])} />
            </label>
            {importing && <button type="button" onClick={() => { importCancelRef.current = true; }}>{t('cancelImport')}</button>}
            <button type="button" onClick={() => void exportBrowserHtml()}>{t('exportBrowserHtml')}</button>
            <label>
              {t('restoreOpenBookmarkJson')}
              <input type="file" accept=".json,application/json" onChange={(event) => void restoreOpenBookmarkJson(event.currentTarget.files?.[0])} />
            </label>
            <button type="button" onClick={() => void exportOpenBookmarkData()}>{t('exportOpenBookmarkJson')}</button>
            <label>
              {t('importRaindropJson')}
              <input type="file" accept=".json,application/json" onChange={(event) => void importRaindropJson(event.currentTarget.files?.[0])} />
            </label>
          </section>
          <section className="backup-panel" aria-labelledby="backup-heading">
            <h2 id="backup-heading">{t('backupAndRestore')}</h2>
            <div className="settings-grid">
              <label>
                {t('webDavUrl')}
                <input value={webDavSettings.url} onChange={(event) => setWebDavSettings({ ...webDavSettings, url: event.target.value })} />
              </label>
              <label>
                {t('webDavDirectory')}
                <input value={webDavSettings.directory} onChange={(event) => setWebDavSettings({ ...webDavSettings, directory: event.target.value })} />
              </label>
              <label>
                {t('webDavUsername')}
                <input autoComplete="username" value={webDavSettings.username} onChange={(event) => setWebDavSettings({ ...webDavSettings, username: event.target.value })} />
              </label>
              <label>
                {t('webDavPassword')}
                <input type="password" autoComplete="current-password" value={webDavSettings.password} onChange={(event) => setWebDavSettings({ ...webDavSettings, password: event.target.value })} />
              </label>
              <label>
                {t('recoveryPassword')}
                <input type="password" value={webDavSettings.recoveryPassword ?? ''} onChange={(event) => setWebDavSettings({ ...webDavSettings, recoveryPassword: event.target.value })} />
              </label>
              <label className="inline-check"><input type="checkbox" checked={webDavSettings.encrypted} onChange={(event) => setWebDavSettings({ ...webDavSettings, encrypted: event.target.checked })} /> {t('encryptedBackups')}</label>
              <label className="inline-check"><input type="checkbox" checked={webDavSettings.autoBackup} onChange={(event) => setWebDavSettings({ ...webDavSettings, autoBackup: event.target.checked })} /> {t('autoBackup')}</label>
            </div>
            <p className="privacy-note">{t('permissionDisclosure')}</p>
            <div className="backup-actions">
              <button type="button" onClick={() => void saveWebDavSettings(webDavSettings)}>{t('saveSettings')}</button>
              <button type="button" onClick={() => void testWebDavConnection()}>{t('testConnection')}</button>
              <button type="button" onClick={() => void runManualBackup()}>{t('manualBackup')}</button>
              <button type="button" onClick={() => void listWebDavVersions()}>{t('listBackups')}</button>
              <button type="button" onClick={() => void clearThumbnailCache()}>{t('clearThumbnailCache')}</button>
              <button type="button" onClick={() => void regenerateThumbnailCache()}>{t('regenerateThumbnailCache')}</button>
            </div>
            {backupVersions.length > 0 && (
              <div className="backup-versions">
                <label>
                  {t('restorePassword')}
                  <input type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
                </label>
                <ul>
                  {backupVersions.map((version) => (
                    <li key={version.url}>
                      <span>{version.name}</span>
                      <span>{version.size} B</span>
                      <button type="button" onClick={() => void restoreWebDavVersion(version)}>{t('restore')}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          </aside>
        )}
        {!showTrash && visibleBookmarks.length > 0 && (
          <section className="bulk-actions" aria-label={t('bulkActions')}>
            <label><input type="checkbox" checked={selectedVisibleIds.length === visibleBookmarks.length} onChange={(event) => selectVisible(event.target.checked)} /> {t('selectVisible')}</label>
            <span>{t('selectedCount', { count: selectedVisibleIds.length })}</span>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => selectVisible(false)}>{t('clearSelection')}</button>
            <label>
              {t('bulkMoveToCollection')}
              <select value={bulkCollectionId} disabled={!selectedVisibleIds.length} onChange={(event) => setBulkCollectionId(event.target.value)}>
                <option value="">{t('unsorted')}</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collectionLabels.get(collection.id)}</option>)}
              </select>
            </label>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('collection')}>{t('apply')}</button>
            <label>
              {t('tags')}
              <input value={bulkTags} disabled={!selectedVisibleIds.length} onChange={(event) => setBulkTags(event.target.value)} />
            </label>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('addTags')}>{t('bulkAddTags')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('removeTags')}>{t('bulkRemoveTags')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('favorite')}>{t('bulkMarkFavorite')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('notFavorite')}>{t('bulkClearFavorite')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('unread')}>{t('bulkMarkUnread')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('read')}>{t('bulkClearUnread')}</button>
            <button type="button" disabled={!selectedVisibleIds.length} onClick={() => void applyBulk('trash')}>{t('bulkMoveToTrash')}</button>
            <button type="button" disabled={!selectedVisibleIds.length || refreshing} onClick={() => void refreshSelectedMetadata()}>{t('refreshMetadata')}</button>
            {refreshing && <button type="button" onClick={() => { refreshCancelRef.current = true; refreshAbortRef.current?.abort(); }}>{t('cancelRefresh')}</button>}
          </section>
        )}
        <p className="manager-status" role="status">{managerStatus}</p>
        {trashCleanupFailed && <p role="alert">{t('trashCleanupError')}</p>}

        {failed ? <p role="alert">{t('loadError')}</p> : showTrash ? (
          trashedBookmarks.length === 0 ? <p>{t('emptyTrash')}</p> : (
            <>
              <button type="button" onClick={() => void emptyTrash()}>{t('emptyTrashAction')}</button>
              <ul className="bookmark-list list-view trash-list" aria-label={t('trash')}>
                {trashedBookmarks.map((bookmark) => (
                  <li key={bookmark.id}>
                    <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
                    <span className="url">{bookmark.url}</span>
                    <time dateTime={bookmark.trashedAt!}>{t('deleted')} {dateFormat.format(new Date(bookmark.trashedAt!))}</time>
                    <button type="button" aria-label={t('restoreBookmark', { title: bookmark.title })} onClick={() => void restoreBookmark(bookmark)}>{t('restore')}</button>
                    <button type="button" aria-label={t('permanentlyDeleteBookmark', { title: bookmark.title })} onClick={() => void permanentlyDelete(bookmark)}>{t('permanentlyDelete')}</button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : bookmarks.length === 0 ? <p>{t('empty')}</p> : visibleBookmarks.length === 0 ? (
          <div className="empty-state">
            <p>{t('noMatches')}</p>
            <button type="button" onClick={clearFilters}>{t('clearAllFilters')}</button>
          </div>
        ) : (
          <ul className={`bookmark-list ${view}-view`} aria-label={t('manager')}>
            {visibleBookmarks.map((bookmark) => (
              <li key={bookmark.id} className={selectedBookmarkId === bookmark.id ? 'selected-bookmark' : ''} onClick={() => setSelectedBookmarkId(bookmark.id)}>
                <label className="bookmark-select">
                  <input type="checkbox" checked={selectedIds.has(bookmark.id)} onChange={(event) => toggleSelected(bookmark.id, event.target.checked)} />
                  {t('selectBookmark', { title: bookmark.title })}
                </label>
                <ThumbnailCover coverUrl={bookmark.coverUrl} title={bookmark.title} />
                <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
                {bookmark.description && <span className="bookmark-description">{bookmark.description}</span>}
                <span className="url">{bookmark.url}</span>
                {bookmark.metadataError && <span role="note">{t('metadataRefreshFailed', { reason: bookmark.metadataError })}</span>}
                <label>
                  {t('collection')}
                  <select
                    aria-label={t('collectionFor', { title: bookmark.title })}
                    value={bookmark.collectionId ?? ''}
                    onChange={(event) => void bookmarkRepository.setCollection(bookmark.id, event.target.value || null)}
                  >
                    <option value="">{t('unsorted')}</option>
                    {collections.map((collection) => <option key={collection.id} value={collection.id}>{collectionLabels.get(collection.id)}</option>)}
                  </select>
                </label>
                <form className="bookmark-tags" onSubmit={(event) => {
                  event.preventDefault();
                  const input = new FormData(event.currentTarget).get('tags');
                  void bookmarkRepository.setTags(bookmark.id, String(input ?? '').split(','));
                }}>
                  <label>
                    {t('tags')}
                    <input name="tags" aria-label={t('tagsFor', { title: bookmark.title })} defaultValue={bookmark.tags.join(', ')} key={bookmark.tags.join('\0')} />
                  </label>
                  <button type="submit">{t('updateTags')}</button>
                </form>
                <div className="bookmark-tag-list">
                  {bookmark.tags.map((tag) => (
                    <button key={tag} type="button" aria-label={t('removeTagFrom', { tag, title: bookmark.title })} onClick={() => void bookmarkRepository.setTags(bookmark.id, bookmark.tags.filter((item) => item !== tag))}>
                      {tag} ×
                    </button>
                  ))}
                </div>
                <button type="button" aria-label={t('moveBookmarkToTrash', { title: bookmark.title })} onClick={() => void moveToTrash(bookmark)}>{t('moveToTrash')}</button>
                <time dateTime={bookmark.createdAt}>{t('created')} {dateFormat.format(new Date(bookmark.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
        {!showTrash && selectedBookmark && (
          <aside className="bookmark-inspector" aria-label={locale === 'zh' ? '书签详情' : 'Bookmark details'}>
            <header>
              <strong>{locale === 'zh' ? '书签详情' : 'Bookmark details'}</strong>
              <button type="button" aria-label="Close bookmark details" onClick={() => setSelectedBookmarkId(null)}>×</button>
            </header>
            <form key={selectedBookmark.id} onSubmit={(event) => { event.preventDefault(); void saveInspector(event.currentTarget); }}>
              <ThumbnailCover coverUrl={selectedBookmark.coverUrl} title={selectedBookmark.title} />
              <label>
                {t('title')}
                <input name="title" defaultValue={selectedBookmark.title} required />
              </label>
              <label>
                {t('description')}
                <textarea name="description" defaultValue={selectedBookmark.description} rows={3} />
              </label>
              <label>
                {t('note')}
                <textarea name="note" defaultValue={selectedBookmark.note} rows={4} />
              </label>
              <label>
                {t('collection')}
                <select name="collectionId" defaultValue={selectedBookmark.collectionId ?? ''}>
                  <option value="">{t('unsorted')}</option>
                  {collections.map((collection) => <option key={collection.id} value={collection.id}>{collectionLabels.get(collection.id)}</option>)}
                </select>
              </label>
              <label>
                {t('tags')}
                <input name="tags" defaultValue={selectedBookmark.tags.join(', ')} />
              </label>
              <label>
                {t('url')}
                <input name="url" type="url" defaultValue={selectedBookmark.url} required />
              </label>
              <label className="inspector-cover-field">
                {t('cover')}
                <input name="coverUrl" type="url" defaultValue={selectedBookmark.coverUrl} />
              </label>
              <div className="inspector-checks">
                <label><input name="favorite" type="checkbox" defaultChecked={selectedBookmark.favorite} /> {t('favorite')}</label>
                <label><input name="unread" type="checkbox" defaultChecked={selectedBookmark.unread} /> {t('unread')}</label>
              </div>
              <p>{t('created')} {dateFormat.format(new Date(selectedBookmark.createdAt))}</p>
              <div className="inspector-actions">
                <button type="button" onClick={() => void moveToTrash(selectedBookmark)}>{t('moveToTrash')}</button>
                <button className="primary" type="submit">{t('save')}</button>
              </div>
            </form>
          </aside>
        )}
      </main>
    </div>
  );
}
