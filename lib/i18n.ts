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
  collections: 'Collections',
  allBookmarks: 'All bookmarks',
  newCollectionName: 'New collection name',
  parentCollection: 'Parent collection',
  createCollection: 'Create collection',
  tags: 'Tags',
  updateTags: 'Update tags',
  clearFilter: 'Clear filter',
  parentFor: 'Parent for {title}',
  moveUp: 'Move {title} up',
  moveDown: 'Move {title} down',
  renameCollection: 'Rename {title}',
  deleteCollection: 'Delete {title}',
  collectionFor: 'Collection for {title}',
  tagsFor: 'Tags for {title}',
  removeTagFrom: 'Remove {tag} from {title}',
  renameCollectionPrompt: 'Rename collection',
  deleteImpact: 'Deleting “{title}” moves {bookmarks} bookmark(s) and {children} child collection(s) to its parent. No bookmarks will be permanently deleted.',
  searchBookmarks: 'Search bookmarks',
  filters: 'Bookmark filters',
  filtersCombineAnd: 'Filters combine with AND',
  favoriteOnly: 'Favorite only',
  unreadOnly: 'Unread only',
  noMatches: 'No bookmarks match your filters.',
  clearAllFilters: 'Clear all filters',
  sortBookmarks: 'Sort bookmarks',
  newestFirst: 'Newest saved first',
  oldestFirst: 'Oldest saved first',
  titleAZ: 'Title A–Z',
  view: 'Bookmark view',
  listView: 'List view',
  cardView: 'Card view',
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
  collections: '收藏夹',
  allBookmarks: '全部书签',
  newCollectionName: '新收藏夹名称',
  parentCollection: '父收藏夹',
  createCollection: '创建收藏夹',
  tags: '标签',
  updateTags: '更新标签',
  clearFilter: '清除筛选',
  parentFor: '{title} 的父收藏夹',
  moveUp: '上移 {title}',
  moveDown: '下移 {title}',
  renameCollection: '重命名 {title}',
  deleteCollection: '删除 {title}',
  collectionFor: '{title} 的收藏夹',
  tagsFor: '{title} 的标签',
  removeTagFrom: '从 {title} 移除 {tag}',
  renameCollectionPrompt: '重命名收藏夹',
  deleteImpact: '删除“{title}”会把 {bookmarks} 个书签和 {children} 个子收藏夹移到上一级。书签不会被永久删除。',
  searchBookmarks: '搜索书签',
  filters: '书签筛选',
  filtersCombineAnd: '筛选条件按“且”组合',
  favoriteOnly: '仅收藏状态',
  unreadOnly: '仅未读状态',
  noMatches: '没有符合当前筛选条件的书签。',
  clearAllFilters: '清除全部筛选',
  sortBookmarks: '书签排序',
  newestFirst: '最新保存优先',
  oldestFirst: '最早保存优先',
  titleAZ: '标题 A–Z',
  view: '书签视图',
  listView: '列表视图',
  cardView: '卡片视图',
};

const messages = { en, zh };

export function getBrowserLocale(): Locale {
  return browser.i18n.getUILanguage().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function translate(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}) {
  return (messages[locale][key] as string).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
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
    t: (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values),
  };
}
