import { browser } from 'wxt/browser';
import { bookmarkRepository, collectionRepository, trashCleanupErrorKey } from '../lib/bookmarks';
import { getBrowserLocale, translate } from '../lib/i18n';
import { backupScheduleKey, backupStatusKey, canUseWebDav, defaultBackupSchedule, sanitizeWebDavSettings, webDavSettingsKey } from '../lib/backup-settings';
import { markAutomaticBackupFinished, noteBackupRelevantChange, shouldRunAutomaticBackup, type BackupScheduleState } from '../lib/backup-scheduler';
import { enforceBackupRetention, uploadBackup, WebDavBackupClient } from '../lib/webdav-backup';

export default defineBackground(() => {
  const cleanupAlarm = 'trash-cleanup';
  const autoBackupAlarm = 'automatic-backup';

  const readSchedule = async () => {
    const stored = await browser.storage.local.get(backupScheduleKey);
    return { ...defaultBackupSchedule, ...((stored[backupScheduleKey] as Partial<BackupScheduleState> | undefined) ?? {}) };
  };

  const readBackupSettings = async () => {
    const stored = await browser.storage.local.get(webDavSettingsKey);
    return sanitizeWebDavSettings(stored[webDavSettingsKey]);
  };

  const currentBackupData = async () => {
    const stored = await browser.storage.local.get(['locale', 'managerPreferences']);
    const storedLocale: 'en' | 'zh' | null = stored.locale === 'en' || stored.locale === 'zh' ? stored.locale : null;
    return {
      collections: await collectionRepository.list(),
      bookmarks: await bookmarkRepository.listAll(),
      tombstones: await bookmarkRepository.listTombstones(),
      settings: {
        locale: storedLocale,
        managerPreferences: stored.managerPreferences ?? null,
      },
    };
  };

  const armAutomaticBackup = async (schedule: BackupScheduleState) => {
    const next = shouldRunAutomaticBackup(schedule, Date.now()) ? Date.now() : null;
    const pendingAt = next ?? (schedule.pendingSince === null ? null : Math.max(schedule.pendingSince + schedule.debounceMs, (schedule.lastAutomaticBackupAt ?? 0) + schedule.minIntervalMs));
    if (pendingAt === null) {
      await browser.alarms.clear(autoBackupAlarm);
    } else {
      await browser.alarms.create(autoBackupAlarm, { when: pendingAt });
    }
  };

  const noteDataChanged = async () => {
    const settings = await readBackupSettings();
    const schedule = noteBackupRelevantChange({ ...(await readSchedule()), autoBackup: settings.autoBackup }, Date.now());
    await browser.storage.local.set({ [backupScheduleKey]: schedule });
    await armAutomaticBackup(schedule);
  };

  const runAutomaticBackup = async () => {
    const settings = await readBackupSettings();
    const schedule = { ...(await readSchedule()), autoBackup: settings.autoBackup };
    if (!shouldRunAutomaticBackup(schedule, Date.now())) {
      await armAutomaticBackup(schedule);
      return;
    }
    if (!canUseWebDav(settings)) return;
    try {
      const client = new WebDavBackupClient(settings);
      const version = await uploadBackup(client, await currentBackupData(), settings);
      await enforceBackupRetention(client, await client.listVersions());
      const nextSchedule = markAutomaticBackupFinished(schedule, Date.now());
      await browser.storage.local.set({
        [backupScheduleKey]: nextSchedule,
        [backupStatusKey]: { ok: true, name: version.name, completedAt: new Date().toISOString() },
      });
    } catch (error) {
      const retrySchedule = { ...schedule, pendingSince: Date.now() };
      await browser.storage.local.set({
        [backupScheduleKey]: retrySchedule,
        [backupStatusKey]: { ok: false, message: error instanceof Error ? error.message : 'Automatic backup failed', completedAt: new Date().toISOString() },
      });
      await armAutomaticBackup(retrySchedule);
    }
  };

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
  void runAutomaticBackup();
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === cleanupAlarm) void runTrashCleanup();
    if (alarm.name === autoBackupAlarm) void runAutomaticBackup();
  });

  let initialDatabaseEmits = 0;
  const handleDatabaseChange = () => {
    initialDatabaseEmits += 1;
    if (initialDatabaseEmits > 3) void noteDataChanged();
  };
  bookmarkRepository.watch().subscribe({ next: handleDatabaseChange });
  bookmarkRepository.watchTrash().subscribe({ next: handleDatabaseChange });
  collectionRepository.watch().subscribe({ next: handleDatabaseChange });

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
