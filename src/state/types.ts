export type Tab = 'cam' | 'hist' | 'setup';

export type DetectionKind = 'Personne' | 'Animal';

export type HistoryFilter = 'Toutes' | 'Personnes' | 'Animaux';

export type Period = "Aujourd'hui" | '7 jours' | '30 jours' | 'Tout';

export type Sensitivity = 'Basse' | 'Moyenne' | 'Haute';

export type Camera = 'Arrière (1×)' | 'Arrière (0,5×)' | 'Avant';

export type PostRoll = '5 s' | '10 s' | '30 s';
/**
 * Longest a single clip may run. A passage that outlasts it is not cut short —
 * it continues in the next clip — so this bounds file size and the granularity
 * of the history, not how long surveillance keeps filming.
 */
export type MaxDuration = '1 min' | '2 min' | '5 min' | '10 min' | '15 min';
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

/** What the volume itself reports. Measured; nothing here is derived. */
export interface VolumeSpace {
  /** Bytes free on the volume holding the clips. */
  free: number;
  /** Total volume size, for the usage bar. */
  total: number;
}

export interface StorageInfo extends VolumeSpace {
  /** Bytes taken by NovaGuard's own clips, summed from the events. */
  used: number;
}

export interface ExpandedSections {
  surv: boolean;
  det: boolean;
  rec: boolean;
  sto: boolean;
  not: boolean;
  about: boolean;
}

/**
 * What came of asking for a permission.
 *
 * `blocked` is the case a boolean hides: Android stops showing the dialog once
 * the user has refused for good, so the request resolves without anything
 * appearing on screen. A caller that cannot tell it from an ordinary refusal
 * can only offer a button that silently does nothing.
 */
export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

/** All three are real OS permissions, re-read live and never persisted. */
export interface Permissions {
  cam: boolean;
  mic: boolean;
  notif: boolean;
}

export interface Settings {
  camera: Camera;
  /**
   * Resume monitoring when the app is opened.
   *
   * Not "start at boot": Android forbids launching a camera foreground service
   * from a BOOT_COMPLETED receiver, or from the background at all, because
   * camera is a while-in-use permission. Reopening the app is the earliest
   * moment surveillance can legally come back.
   * https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
   */
  resumeOnLaunch: boolean;
  night: boolean;
  person: boolean;
  animal: boolean;
  sens: Sensitivity;
  threshold: number;
  /** Cinematic auto-zoom: ease in on a detected face, hold, then pull back to the whole person. */
  autoZoom: boolean;
  /**
   * Run the detection model on the CPU, skipping the GPU delegate.
   *
   * A diagnostic, not a preference: the automatic fallback only catches a GPU
   * delegate that refuses to load the model, and one that loads it and then
   * returns nothing is indistinguishable from an empty room.
   */
  forceCpu: boolean;
  post: PostRoll;
  max: MaxDuration;
  quality: Quality;
  retention: Retention;
  autoDel: boolean;
  notif: boolean;
  notifDet: boolean;
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
  events: DetectionEvent[];
  detToday: DayCount;
  lastDet: string;
  onboardingComplete: boolean;
}
