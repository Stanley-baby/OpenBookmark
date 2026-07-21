import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { bookmarkRepository } from '../../lib/bookmarks';
import { type Locale, useI18n } from '../../lib/i18n';

interface CurrentPage {
  url: string;
  title: string;
}

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [page, setPage] = useState<CurrentPage>();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url && /^https?:/.test(tab.url)) {
        setPage({ url: tab.url, title: tab.title || tab.url });
      }
    });
  }, []);

  async function save() {
    if (!page) return;
    setStatus('saving');
    try {
      await bookmarkRepository.save(page.url, page.title);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  function openManager() {
    void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') });
  }

  const statusText = status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : status === 'error' ? t('saveError') : '';

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
              <input value={page.title} readOnly />
            </label>
            <label>
              {t('url')}
              <input value={page.url} readOnly />
            </label>
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
