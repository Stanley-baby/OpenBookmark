import { useEffect, useMemo, useState } from 'react';
import {
  bookmarkRepository,
  collectionDescendantIds,
  collectionPath,
  collectionRepository,
  type Bookmark,
  type Collection,
} from '../../lib/bookmarks';
import { type Locale, useI18n } from '../../lib/i18n';

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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
    const collectionSubscription = collectionRepository.watch().subscribe({ next: setCollections, error: () => setFailed(true) });
    return () => {
      bookmarkSubscription.unsubscribe();
      collectionSubscription.unsubscribe();
    };
  }, []);

  const visibleBookmarks = bookmarks.filter((bookmark) =>
    (!collectionFilter || bookmark.collectionId === collectionFilter) && (!tagFilter || bookmark.tags.includes(tagFilter)),
  );
  const tags = useMemo(() => [...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))].sort(), [bookmarks]);
  const dateFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' });

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

  return (
    <div className="layout">
      <aside>
        <strong>OpenBookmark</strong>
        <section className="collections" aria-labelledby="collections-heading">
          <h2 id="collections-heading">{t('collections')}</h2>
          <button type="button" onClick={() => setCollectionFilter(null)}>{t('allBookmarks')}</button>
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
                    className={collectionFilter === collection.id ? 'selected' : ''}
                    onClick={() => setCollectionFilter(collection.id)}
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
            <div className="tag-list">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTagFilter(tag)}>{tag}</button>)}</div>
          </section>
        )}
      </aside>
      <main>
        <header>
          <h1>{t('manager')}</h1>
          <label className="language">
            {t('language')}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="en">{t('english')}</option>
              <option value="zh">{t('chinese')}</option>
            </select>
          </label>
        </header>

        {failed ? <p role="alert">{t('loadError')}</p> : visibleBookmarks.length === 0 ? <p>{t('empty')}</p> : (
          <ul className="bookmark-list" aria-label={t('manager')}>
            {visibleBookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
                <span className="url">{bookmark.url}</span>
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
                <time dateTime={bookmark.createdAt}>{t('created')} {dateFormat.format(new Date(bookmark.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
