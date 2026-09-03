import { DetectionEvent, Settings } from './types';

export const defaultSettings: Settings = {
  camera: 'Arrière (1×)',
  resumeOnLaunch: true,
  night: true,
  person: true,
  animal: true,
  sens: 'Moyenne',
  threshold: 75,
  autoZoom: true,
  forceCpu: false,
  post: '10 s',
  max: '2 min',
  quality: '1080p',
  retention: '30 jours',
  autoDel: true,
  notif: true,
  notifDet: true,
  exp: { surv: true, det: false, rec: false, sto: false, not: false, about: false },
};

/**
 * Empty on purpose. Earlier versions seeded seven fabricated events here, which
 * the persistence layer then wrote to disk on first launch — leaving fake
 * recordings mixed into real history with no way to tell them apart.
 */
export const defaultEvents: DetectionEvent[] = [];

export const defaultDetToday = 0;
export const defaultLastDet = '—';
