import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { bookmarkRepository, collectionRepository, type BookmarkInput, type Collection } from '../../lib/bookmarks';
import { type Locale, useI18n } from '../../lib/i18n';
import { readPageMetadata } from '../../lib/metadata';

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [page, setPage] = useState<BookmarkInput>();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'updated' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    async function loadPage() {
      const availableCollections = await collectionRepository.list();
      if (active) setCollections(availableCollections);
      const requestedTabId = Number(new URLSearchParams(location.search).get('tabId'));
      const tab = Number.isInteger(requestedTabId) && requestedTabId > 0
        ? await browser.tabs.get(requestedTabId)
        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
      if (!active || !tab?.url || !/^https?:/.test(tab.url)) return;

      const existing = await bookmarkRepository.findByUrl(tab.url);
      if (existing) {
        setPage(existing);
        return;
      }

      let metadata = { title: tab.title || tab.url, description: '', coverUrl: '' };
      if (tab.id) {
        try {
          const [injection] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: readPageMetadata });
          if (injection?.result) metadata = injection.result;
        } catch {
          // URL and tab title remain editable when page metadata cannot be read.
        }
      }
      if (active) setPage({ ...metadata, url: tab.url, note: '', favorite: false, unread: false, collectionId: null });
    }
    void loadPage();
    return () => { active = false; };
  }, []);

  async function save() {
    if (!page) return;
    setStatus('saving');
    try {
      const result = await bookmarkRepository.save(page);
      setPage({ ...page, id: result.id });
      setStatus(result.created ? 'saved' : 'updated');
    } catch {
      setStatus('error');
    }
  }

  function openManager() {
    void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
  }

  const statusText = status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : status === 'updated' ? t('updated') : status === 'error' ? t('saveError') : '';

  return (
    <main>
      <header>
        <strong>OpenBookmark</strong>
        <label className="language">
          {t('language')}
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
            <option value="en">{t('english')}</option>
            <option value="zh">{t('chinese')}</option>
          </select>
        </label>
      </header>

      <section aria-labelledby="current-page-heading">
        <h1 id="current-page-heading">{t('currentPage')}</h1>
        {page ? (
          <>
            <label>
              {t('title')}
              <input value={page.title} onChange={(event) => setPage({ ...page, title: event.target.value })} />
            </label>
            <label>
              {t('url')}
              <input value={page.url} onChange={(event) => setPage({ ...page, url: event.target.value })} />
            </label>
            <label>
              {t('description')}
              <textarea value={page.description} onChange={(event) => setPage({ ...page, description: event.target.value })} />
            </label>
            <label>
              {t('cover')}
              <input value={page.coverUrl} onChange={(event) => setPage({ ...page, coverUrl: event.target.value })} />
            </label>
            <label>
              {t('note')}
              <textarea value={page.note} onChange={(event) => setPage({ ...page, note: event.target.value })} />
            </label>
            <label>
              {t('collection')}
              <select value={page.collectionId ?? ''} onChange={(event) => setPage({ ...page, collectionId: event.target.value || null })}>
                <option value="">{t('unsorted')}</option>
                {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
              </select>
            </label>
            <div className="checks">
              <label><input type="checkbox" checked={page.favorite} onChange={(event) => setPage({ ...page, favorite: event.target.checked })} /> {t('favorite')}</label>
              <label><input type="checkbox" checked={page.unread} onChange={(event) => setPage({ ...page, unread: event.target.checked })} /> {t('unread')}</label>
            </div>
          </>
        ) : (
          <p>{t('unavailable')}</p>
        )}
      </section>

      <div className="actions">
        <button className="primary" type="button" disabled={!page || status === 'saving'} onClick={save}>
          {t('save')}
        </button>
        <button type="button" onClick={openManager}>{t('openManager')}</button>
      </div>
      <p className="status" role="status">{statusText}</p>
    </main>
  );
}
