export type Tab = 'cam' | 'hist' | 'setup';

export type DetectionKind = 'Personne' | 'Animal';

export type HistoryFilter = 'Toutes' | 'Personnes' | 'Animaux';

export type Period = "Aujourd'hui" | '7 jours' | '30 jours' | 'Tout';

export type Sensitivity = 'Basse' | 'Moyenne' | 'Haute';

export type Camera = 'Arrière (1×)' | 'Arrière (0,5×)' | 'Avant';

export type PreRoll = '0 s' | '3 s' | '5 s';
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
  size: string;
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
  pre: PreRoll;
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

export interface PersistedState {
  settings: Settings;
  perms: Permissions;
  events: DetectionEvent[];
  detToday: number;
  lastDet: string;
  onboardingComplete: boolean;
}
