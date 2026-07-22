import { browser } from 'wxt/browser';
import { bookmarkRepository, trashCleanupErrorKey } from '../lib/bookmarks';
import { getBrowserLocale, translate } from '../lib/i18n';

export default defineBackground(() => {
  const cleanupAlarm = 'trash-cleanup';
  const runTrashCleanup = async () => {
    try {
      await bookmarkRepository.cleanupExpiredTrash();
      await browser.storage.local.remove(trashCleanupErrorKey);
    } catch {
      await browser.storage.local.set({ [trashCleanupErrorKey]: { occurredAt: new Date().toISOString() } });
    }
  };

  void browser.alarms.create(cleanupAlarm, { periodInMinutes: 24 * 60 });
  void runTrashCleanup();
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === cleanupAlarm) void runTrashCleanup();
  });

  const openSavePopup = (tabId?: number) => {
    const url = new URL(browser.runtime.getURL('/popup.html'));
    if (tabId) url.searchParams.set('tabId', String(tabId));
    void browser.windows.create({ url: url.href, type: 'popup', width: 440, height: 640 });
  };

  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: 'save-page',
        title: translate(getBrowserLocale(), 'contextMenuSave'),
        contexts: ['page'],
      });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-page') openSavePopup(tab?.id);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === 'save-page') openSavePopup(tab?.id);
  });
});
