import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const en = {
  language: 'Language',
  english: 'English',
  chinese: '中文',
  currentPage: 'Current page',
  title: 'Title',
  url: 'URL',
  save: 'Save bookmark',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Could not save this page.',
  unavailable: 'This page cannot be saved.',
  openManager: 'Open Manager',
  manager: 'Bookmarks',
  empty: 'No bookmarks yet.',
  created: 'Saved',
  loadError: 'Could not load bookmarks.',
} as const;

type MessageKey = keyof typeof en;
export type Locale = 'en' | 'zh';

const zh: Record<MessageKey, string> = {
  language: '语言',
  english: 'English',
  chinese: '中文',
  currentPage: '当前页面',
  title: '标题',
  url: '网址',
  save: '保存书签',
  saving: '正在保存…',
  saved: '已保存',
  saveError: '无法保存此页面。',
  unavailable: '此页面无法保存。',
  openManager: '打开全页管理器',
  manager: '书签',
  empty: '还没有书签。',
  created: '保存于',
  loadError: '无法加载书签。',
};

const messages = { en, zh };

function browserLocale(): Locale {
  return browser.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(browserLocale);

  useEffect(() => {
    browser.storage.local.get('locale').then(({ locale: storedLocale }) => {
      if (storedLocale === 'en' || storedLocale === 'zh') setLocaleState(storedLocale);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    void browser.storage.local.set({ locale: nextLocale });
  }

  return {
    locale,
    setLocale,
    t: (key: MessageKey) => messages[locale][key],
  };
}
