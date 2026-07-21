import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const en = {
  language: 'Language',
  english: 'English',
  chinese: '中文',
  currentPage: 'Current page',
  title: 'Title',
  url: 'URL',
  description: 'Description',
  cover: 'Cover',
  note: 'Note',
  favorite: 'Favorite',
  unread: 'Unread',
  collection: 'Collection',
  unsorted: 'Unsorted',
  save: 'Save bookmark',
  saving: 'Saving…',
  saved: 'Saved',
  updated: 'Updated',
  saveError: 'Could not save this page.',
  unavailable: 'This page cannot be saved.',
  openManager: 'Open Manager',
  contextMenuSave: 'Save with OpenBookmark',
  manager: 'Bookmarks',
  empty: 'No bookmarks yet.',
  created: 'Saved',
  loadError: 'Could not load bookmarks.',
} as const;

export type MessageKey = keyof typeof en;
export type Locale = 'en' | 'zh';

const zh: Record<MessageKey, string> = {
  language: '语言',
  english: 'English',
  chinese: '中文',
  currentPage: '当前页面',
  title: '标题',
  url: '网址',
  description: '描述',
  cover: '封面',
  note: '备注',
  favorite: '收藏状态',
  unread: '未读状态',
  collection: '收藏夹',
  unsorted: '未分类',
  save: '保存书签',
  saving: '正在保存…',
  saved: '已保存',
  updated: '已更新',
  saveError: '无法保存此页面。',
  unavailable: '此页面无法保存。',
  openManager: '打开全页管理器',
  contextMenuSave: '使用 OpenBookmark 保存',
  manager: '书签',
  empty: '还没有书签。',
  created: '保存于',
  loadError: '无法加载书签。',
};

const messages = { en, zh };

export function getBrowserLocale(): Locale {
  return browser.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function translate(locale: Locale, key: MessageKey) {
  return messages[locale][key];
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(getBrowserLocale);

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
    t: (key: MessageKey) => translate(locale, key),
  };
}
