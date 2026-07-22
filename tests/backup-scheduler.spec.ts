import { expect, test } from '@playwright/test';
import { markAutomaticBackupFinished, nextAutomaticBackupAt, noteBackupRelevantChange, shouldRunAutomaticBackup, type BackupScheduleState } from '../lib/backup-scheduler';

const state: BackupScheduleState = {
  autoBackup: true,
  pendingSince: null,
  lastAutomaticBackupAt: 0,
  debounceMs: 10 * 60 * 1000,
  minIntervalMs: 60 * 60 * 1000,
};

test('coalesces continuous changes and respects the hourly automatic limit', () => {
  const changed = noteBackupRelevantChange(state, 1_000);
  const changedAgain = noteBackupRelevantChange(changed, 2_000);

  expect(changedAgain.pendingSince).toBe(2_000);
  expect(nextAutomaticBackupAt(changedAgain)).toBe(60 * 60 * 1000);
  expect(shouldRunAutomaticBackup(changedAgain, 59 * 60 * 1000)).toBe(false);
  expect(shouldRunAutomaticBackup(changedAgain, 60 * 60 * 1000)).toBe(true);
});

test('debounces backup until ten minutes after the latest change', () => {
  const changed = noteBackupRelevantChange({ ...state, lastAutomaticBackupAt: null }, 1_000);
  const changedAgain = noteBackupRelevantChange(changed, 2_000);

  expect(nextAutomaticBackupAt(changedAgain)).toBe(2_000 + 10 * 60 * 1000);
});

test('manual completion can reset pending work and disabled automatic backup does not schedule', () => {
  expect(markAutomaticBackupFinished(noteBackupRelevantChange(state, 1), 2)).toMatchObject({ pendingSince: null, lastAutomaticBackupAt: 2 });
  expect(nextAutomaticBackupAt(noteBackupRelevantChange({ ...state, autoBackup: false }, 1))).toBeNull();
});
