import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [managerStatus, setManagerStatus] = useState('');
  const [trashCleanupFailed, setTrashCleanupFailed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState('');
  const [bulkCollectionId, setBulkCollectionId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshCancelRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const collectionLabels = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collectionPath(collection, collections)])),
    [collections],
  );
  const descendantsByCollection = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collectionDescendantIds(collection.id, collections)])),
    [collections],
  );

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

  const visibleBookmarks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = bookmarks.filter((bookmark) => {
      const searchableText = [bookmark.title, bookmark.url, bookmark.description, bookmark.note, ...bookmark.tags]
        .join('\n')
        .toLocaleLowerCase();
      return (!query || searchableText.includes(query))
        && (!collectionFilter || bookmark.collectionId === collectionFilter)
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
  }, [bookmarks, collectionFilter, favoriteOnly, locale, search, sort, tagFilter, unreadOnly]);
  const tags = useMemo(() => [...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))].sort(), [bookmarks]);
  const dateFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  const selectedVisibleIds = useMemo(() => visibleBookmarks.filter((bookmark) => selectedIds.has(bookmark.id)).map((bookmark) => bookmark.id), [selectedIds, visibleBookmarks]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [collectionFilter, favoriteOnly, search, showTrash, tagFilter, unreadOnly]);

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
    setManagerStatus(t('movedToTrash', { title: bookmark.title }));
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

  return (
    <div className="layout">
      <aside>
        <strong>OpenBookmark</strong>
        <section className="collections" aria-labelledby="collections-heading">
          <h2 id="collections-heading">{t('collections')}</h2>
          <button type="button" aria-pressed={!showTrash && collectionFilter === null} onClick={() => { setShowTrash(false); setCollectionFilter(null); }}>{t('allBookmarks')}</button>
          <button type="button" aria-pressed={showTrash} onClick={() => setShowTrash(true)}>{t('trash')}</button>
          <form onSubmit={(event) => { event.preventDefault(); void createCollection(event.currentTarget); }}>
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
              return (
                <li key={collection.id} className="collection-item">
                  <button
                    type="button"
                    data-collection-id={collection.id}
                    className={!showTrash && collectionFilter === collection.id ? 'selected' : ''}
                    aria-pressed={!showTrash && collectionFilter === collection.id}
                    onClick={() => { setShowTrash(false); setCollectionFilter(collection.id); }}
                  >
                    {collection.title}
                  </button>
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
            <div className="tag-list">{tags.map((tag) => <button key={tag} type="button" aria-pressed={!showTrash && tagFilter === tag} onClick={() => { setShowTrash(false); setTagFilter(tag); }}>{tag}</button>)}</div>
          </section>
        )}
      </aside>
      <main>
        <header>
          <h1>{showTrash ? t('trash') : t('manager')}</h1>
          <label className="language">
            {t('language')}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="en">{t('english')}</option>
              <option value="zh">{t('chinese')}</option>
            </select>
          </label>
        </header>

        {!showTrash && <section className="manager-controls" aria-label={t('filters')}>
          <label>
            {t('searchBookmarks')}
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
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
              <ul className="bookmark-list list-view" aria-label={t('trash')}>
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
              <li key={bookmark.id}>
                <label className="bookmark-select">
                  <input type="checkbox" checked={selectedIds.has(bookmark.id)} onChange={(event) => toggleSelected(bookmark.id, event.target.checked)} />
                  {t('selectBookmark', { title: bookmark.title })}
                </label>
                <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
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
      </main>
    </div>
  );
}
