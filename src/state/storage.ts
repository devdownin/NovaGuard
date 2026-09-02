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
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
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

  loadEvents: () => readJson<DetectionEvent[]>(KEYS.events),
  saveEvents: (v: DetectionEvent[]) => writeJson(KEYS.events, v),

  loadDetToday: () => readJson<DayCount>(KEYS.detToday),
  saveDetToday: (v: DayCount) => writeJson(KEYS.detToday, v),

  loadLastDet: () => readJson<string>(KEYS.lastDet),
  saveLastDet: (v: string) => writeJson(KEYS.lastDet, v),

  loadOnboardingComplete: () => readJson<boolean>(KEYS.onboardingComplete),
  saveOnboardingComplete: (v: boolean) => writeJson(KEYS.onboardingComplete, v),
};
