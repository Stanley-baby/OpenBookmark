import { useEffect, useState } from 'react';
import { bookmarkRepository, type Bookmark } from '../../lib/bookmarks';
import { type Locale, useI18n } from '../../lib/i18n';

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscription = bookmarkRepository.watch().subscribe({
      next: setBookmarks,
      error: () => setFailed(true),
    });
    return () => subscription.unsubscribe();
  }, []);

  const dateFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="layout">
      <aside>
        <strong>OpenBookmark</strong>
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

        {failed ? <p role="alert">{t('loadError')}</p> : bookmarks.length === 0 ? <p>{t('empty')}</p> : (
          <ul aria-label={t('manager')}>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.title}</a>
                <span className="url">{bookmark.url}</span>
                <time dateTime={bookmark.createdAt}>{t('created')} {dateFormat.format(new Date(bookmark.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
