import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayCount, DetectionEvent, Settings } from './types';

/**
 * `events` and `detToday` are versioned keys.
 *
 * v1 events had a `size: string` computed from a made-up bitrate and no file on
 * disk, and v1 `detToday` was a bare number that never reset. Reading either
 * shape back would show invented data as if it were real, so the new keys let
 * the old values fall away instead of being migrated.
 */
const KEYS = {
  settings: '@novaguard:settings',
  events: '@novaguard:events:v2',
  detToday: '@novaguard:detToday:v2',
  lastDet: '@novaguard:lastDet',
  monitoring: '@novaguard:monitoring',
  onboardingComplete: '@novaguard:onboardingComplete',
} as const;

// '@novaguard:perms' held simulated mic/notification grants; all three
// permissions are real OS state now, so the key has no meaning any more.
const STALE_KEYS = ['@novaguard:events', '@novaguard:detToday', '@novaguard:perms'];

/** Best-effort removal of the superseded keys so they don't sit there forever. */
export async function dropStaleKeys(): Promise<void> {
  try {
    // AsyncStorage v3 dropped the batch `multiRemove` from its public API.
    await Promise.all(STALE_KEYS.map(k => AsyncStorage.removeItem(k)));
  } catch {
    // Not worth surfacing: the data is unreachable either way.
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  return (await readJsonChecked<T>(key)).value;
}

/**
 * A read that says whether it worked.
 *
 * `readJson` collapses "never written" and "could not be read" into the same
 * `null`, which is fine for a setting — the default takes over — and dangerous
 * for the event list: the startup sweep deletes every clip on disk that no
 * event points at, so an unreadable history reads as an empty one and takes
 * the user's recordings with it. Callers that can destroy something use this.
 */
async function readJsonChecked<T>(key: string): Promise<{ ok: boolean; value: T | null }> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return { ok: true, value: raw ? (JSON.parse(raw) as T) : null };
  } catch {
    return { ok: false, value: null };
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort: local persistence is a convenience, not a correctness requirement
  }
}

export const storage = {
  loadSettings: () => readJson<Settings>(KEYS.settings),
  saveSettings: (v: Settings) => writeJson(KEYS.settings, v),

  /**
   * `ok` is false when the key exists but could not be read or parsed. Nothing
   * may be deleted or overwritten on that answer — see `readJsonChecked`.
   */
  loadEvents: () => readJsonChecked<DetectionEvent[]>(KEYS.events),
  saveEvents: (v: DetectionEvent[]) => writeJson(KEYS.events, v),

  loadDetToday: () => readJson<DayCount>(KEYS.detToday),
  saveDetToday: (v: DayCount) => writeJson(KEYS.detToday, v),

  loadLastDet: () => readJson<string>(KEYS.lastDet),
  saveLastDet: (v: string) => writeJson(KEYS.lastDet, v),

  loadMonitoring: () => readJson<boolean>(KEYS.monitoring),
  saveMonitoring: (v: boolean) => writeJson(KEYS.monitoring, v),

  loadOnboardingComplete: () => readJson<boolean>(KEYS.onboardingComplete),
  saveOnboardingComplete: (v: boolean) => writeJson(KEYS.onboardingComplete, v),
};
