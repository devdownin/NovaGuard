import AsyncStorage from '@react-native-async-storage/async-storage';
import { DetectionEvent, Permissions, Settings } from './types';

const KEYS = {
  settings: '@novaguard:settings',
  perms: '@novaguard:perms',
  events: '@novaguard:events',
  detToday: '@novaguard:detToday',
  lastDet: '@novaguard:lastDet',
  onboardingComplete: '@novaguard:onboardingComplete',
} as const;

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

  loadPerms: () => readJson<Permissions>(KEYS.perms),
  savePerms: (v: Permissions) => writeJson(KEYS.perms, v),

  loadEvents: () => readJson<DetectionEvent[]>(KEYS.events),
  saveEvents: (v: DetectionEvent[]) => writeJson(KEYS.events, v),

  loadDetToday: () => readJson<number>(KEYS.detToday),
  saveDetToday: (v: number) => writeJson(KEYS.detToday, v),

  loadLastDet: () => readJson<string>(KEYS.lastDet),
  saveLastDet: (v: string) => writeJson(KEYS.lastDet, v),

  loadOnboardingComplete: () => readJson<boolean>(KEYS.onboardingComplete),
  saveOnboardingComplete: (v: boolean) => writeJson(KEYS.onboardingComplete, v),
};
