import { DetectionEvent, Settings } from './types';
import { SimulatedPermissions } from './storage';

function at(daysBack: number, hours: number, minutes: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export const defaultSettings: Settings = {
  camera: 'Arrière (1×)',
  boot: true,
  night: true,
  person: true,
  animal: true,
  sens: 'Moyenne',
  threshold: 75,
  autoZoom: true,
  pre: '3 s',
  post: '10 s',
  max: '2 min',
  quality: '1080p',
  retention: '30 jours',
  autoDel: true,
  notif: true,
  notifDet: true,
  sound: false,
  vibe: true,
  exp: { surv: true, det: false, rec: false, sto: false, not: false, about: false },
};

export const defaultSimulatedPermissions: SimulatedPermissions = {
  mic: false,
  notif: false,
};

export const defaultEvents: DetectionEvent[] = [
  { id: 1, kind: 'Personne', timestamp: at(0, 8, 42), dur: 18, conf: 94, size: '14,2 Mo' },
  { id: 2, kind: 'Animal', timestamp: at(0, 7, 15), dur: 9, conf: 88, size: '7,4 Mo' },
  { id: 3, kind: 'Personne', timestamp: at(0, 6, 58), dur: 24, conf: 91, size: '19,8 Mo' },
  { id: 4, kind: 'Personne', timestamp: at(1, 22, 31), dur: 32, conf: 96, size: '26,1 Mo' },
  { id: 5, kind: 'Animal', timestamp: at(1, 19, 4), dur: 12, conf: 82, size: '9,6 Mo' },
  { id: 6, kind: 'Personne', timestamp: at(4, 11, 20), dur: 15, conf: 89, size: '12,0 Mo' },
  { id: 7, kind: 'Animal', timestamp: at(20, 5, 47), dur: 7, conf: 79, size: '5,9 Mo' },
];

export const defaultDetToday = 3;
export const defaultLastDet = '08:42';
