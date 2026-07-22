import type { BackupScheduleState } from './backup-scheduler';
import type { WebDavSettings } from './webdav-backup';

export const webDavSettingsKey = 'webDavBackupSettings';
export const backupScheduleKey = 'backupSchedule';
export const restoreProtectionSnapshotKey = 'restoreProtectionSnapshot';
export const backupStatusKey = 'backupStatus';

export const defaultBackupSchedule: BackupScheduleState = {
  autoBackup: false,
  pendingSince: null,
  lastAutomaticBackupAt: null,
  debounceMs: 10 * 60 * 1000,
  minIntervalMs: 60 * 60 * 1000,
};

export function sanitizeWebDavSettings(value: unknown): WebDavSettings {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<WebDavSettings> : {};
  return {
    url: typeof input.url === 'string' ? input.url : '',
    username: typeof input.username === 'string' ? input.username : '',
    password: typeof input.password === 'string' ? input.password : '',
    directory: typeof input.directory === 'string' ? input.directory : 'OpenBookmark',
    encrypted: input.encrypted !== false,
    recoveryPassword: typeof input.recoveryPassword === 'string' ? input.recoveryPassword : '',
    autoBackup: input.autoBackup === true,
  };
}

export function canUseWebDav(settings: WebDavSettings) {
  return Boolean(settings.url.trim() && settings.username && settings.password && settings.directory.trim() && (!settings.encrypted || settings.recoveryPassword));
}
