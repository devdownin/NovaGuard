export type Tab = 'cam' | 'hist' | 'setup';

export type DetectionKind = 'Personne' | 'Animal';

export type HistoryFilter = 'Toutes' | 'Personnes' | 'Animaux';

export type Period = "Aujourd'hui" | '7 jours' | '30 jours' | 'Tout';

export type Sensitivity = 'Basse' | 'Moyenne' | 'Haute';

export type Camera = 'Arrière (1×)' | 'Arrière (0,5×)' | 'Avant';

export type PostRoll = '5 s' | '10 s' | '30 s';
export type MaxDuration = '1 min' | '2 min' | '5 min';
export type Quality = '720p' | '1080p' | '4K';
export type Retention = '1 jour' | '7 jours' | '30 jours' | '90 jours' | 'Toujours';

export interface DetectionEvent {
  id: number;
  kind: DetectionKind;
  /** epoch ms — display label and period bucket are derived from this, not stored. */
  timestamp: number;
  dur: number;
  conf: number;
  /**
   * Absolute path of the recorded clip, or `null` when no file was produced
   * (recording refused, disk full, permission missing). The event is still
   * worth keeping — it says something was seen — so this is nullable rather
   * than a reason to drop it.
   */
  path: string | null;
  /** Real size on disk in bytes, read back with `stat` after the file closed. */
  bytes: number;
}

export interface StorageInfo {
  /** Bytes taken by NovaGuard's own clips. */
  used: number;
  /** Bytes free on the volume holding them. */
  free: number;
  /** Total volume size, for the usage bar. */
  total: number;
}

export interface ExpandedSections {
  surv: boolean;
  det: boolean;
  rec: boolean;
  sto: boolean;
  not: boolean;
  about: boolean;
}

export interface Permissions {
  /** Backed by the real OS camera permission (react-native-vision-camera) — not persisted, always re-read live. */
  cam: boolean;
  mic: boolean;
  notif: boolean;
}

export interface Settings {
  camera: Camera;
  boot: boolean;
  night: boolean;
  person: boolean;
  animal: boolean;
  sens: Sensitivity;
  threshold: number;
  /** Cinematic auto-zoom: ease in on a detected face, hold, then pull back to the whole person. */
  autoZoom: boolean;
  post: PostRoll;
  max: MaxDuration;
  quality: Quality;
  retention: Retention;
  autoDel: boolean;
  notif: boolean;
  notifDet: boolean;
  sound: boolean;
  vibe: boolean;
  exp: ExpandedSections;
}

export type InfoPanel = 'perms' | 'data' | 'licenses' | null;
export type OnboardingStep = 'intro' | 'perms' | null;

/** Daily detection counter — the day is stored so it can reset at midnight. */
export interface DayCount {
  count: number;
  /** epoch ms of any moment during the counted day. */
  day: number;
}

export interface PersistedState {
  settings: Settings;
  perms: Permissions;
  events: DetectionEvent[];
  detToday: DayCount;
  lastDet: string;
  onboardingComplete: boolean;
}
