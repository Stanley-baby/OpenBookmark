export interface BackupScheduleState {
  autoBackup: boolean;
  pendingSince: number | null;
  lastAutomaticBackupAt: number | null;
  debounceMs: number;
  minIntervalMs: number;
}

export function noteBackupRelevantChange(state: BackupScheduleState, now: number): BackupScheduleState {
  if (!state.autoBackup) return { ...state, pendingSince: null };
  return { ...state, pendingSince: now };
}

export function nextAutomaticBackupAt(state: BackupScheduleState) {
  if (!state.autoBackup || state.pendingSince === null) return null;
  const nextAllowedByRateLimit = state.lastAutomaticBackupAt === null ? 0 : state.lastAutomaticBackupAt + state.minIntervalMs;
  return Math.max(state.pendingSince + state.debounceMs, nextAllowedByRateLimit);
}

export function shouldRunAutomaticBackup(state: BackupScheduleState, now: number) {
  const next = nextAutomaticBackupAt(state);
  return next !== null && now >= next;
}

export function markAutomaticBackupFinished(state: BackupScheduleState, now: number): BackupScheduleState {
  return { ...state, pendingSince: null, lastAutomaticBackupAt: now };
}
