import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useCameraPermission } from 'react-native-vision-camera';
import {
  Camera, DetectionEvent, DetectionKind, ExpandedSections, HistoryFilter, InfoPanel,
  MaxDuration, OnboardingStep, Period, Permissions, PostRoll, PreRoll, Quality,
  Retention, Sensitivity, Settings, Tab,
} from './types';
import {
  defaultDetToday, defaultEvents, defaultLastDet, defaultSettings, defaultSimulatedPermissions,
} from './defaults';
import { storage } from './storage';
import { daysAgo, formatClock, formatMo, pad } from '../utils/date';
import { DetectionBox, FrameDetection } from '../ml/types';

interface AppStateValue {
  hydrated: boolean;

  // navigation
  tab: Tab;
  setTab: (t: Tab) => void;

  // surveillance
  monitoring: boolean;
  det: DetectionKind | null;
  conf: number;
  box: DetectionBox | null;
  recSec: number;
  clock: string;
  detToday: number;
  lastDet: string;
  toggleMonitoring: () => void;
  /** Called from the camera frame-processor (JS thread) with this frame's qualifying detections. */
  reportDetections: (detections: FrameDetection[]) => void;

  // history
  events: DetectionEvent[];
  filter: HistoryFilter;
  setFilter: (f: HistoryFilter) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  periodOpen: boolean;
  togglePeriodOpen: () => void;
  selected: number | null;
  selectEvent: (id: number | null) => void;

  // confirmations
  confirmDelete: boolean;
  askDelete: () => void;
  cancelDelete: () => void;
  doDelete: () => void;
  confirmWipe: boolean;
  askWipe: () => void;
  cancelWipe: () => void;
  doWipe: () => void;

  // setup
  settings: Settings;
  toggleSection: (key: keyof ExpandedSections) => void;
  cycleCamera: () => void;
  toggleBoot: () => void;
  toggleNight: () => void;
  togglePerson: () => void;
  toggleAnimal: () => void;
  setSensitivity: (s: Sensitivity) => void;
  setThreshold: (v: number) => void;
  cyclePre: () => void;
  cyclePost: () => void;
  cycleMax: () => void;
  cycleQuality: () => void;
  setRetention: (r: Retention) => void;
  toggleAutoDel: () => void;
  toggleNotif: () => void;
  toggleNotifDet: () => void;
  toggleSound: () => void;
  toggleVibe: () => void;
  wipeAllVideos: () => void;

  // info panel (permissions / stored data)
  info: InfoPanel;
  openInfo: (panel: Exclude<InfoPanel, null>) => void;
  closeInfo: () => void;

  // onboarding
  onb: OnboardingStep;
  perms: Permissions;
  onbNext: () => void;
  onbFinish: () => void;
  grantPermission: (key: keyof Permissions) => void;
}

const AppStateCtx = createContext<AppStateValue | null>(null);

function cycle<T>(options: readonly T[], current: T): T {
  const i = options.indexOf(current);
  return options[(i + 1) % options.length];
}

const CAMERA_OPTIONS: Camera[] = ['Arrière (1×)', 'Arrière (0,5×)', 'Avant'];
const PRE_OPTIONS: PreRoll[] = ['0 s', '3 s', '5 s'];
const POST_OPTIONS: PostRoll[] = ['5 s', '10 s', '30 s'];
const MAX_OPTIONS: MaxDuration[] = ['1 min', '2 min', '5 min'];
const QUALITY_OPTIONS: Quality[] = ['720p', '1080p', '4K'];

// How many consecutive empty frame reports end an active detection session.
// At the frame processor's throttled rate (1–5 fps, see settings.sens) this is roughly 1–3s.
const MISS_LIMIT = 3;

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState<Tab>('cam');

  const [monitoring, setMonitoring] = useState(false);
  const [det, setDet] = useState<DetectionKind | null>(null);
  const [conf, setConf] = useState(0);
  const [box, setBox] = useState<DetectionBox | null>(null);
  const [recSec, setRecSec] = useState(0);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [detToday, setDetToday] = useState(defaultDetToday);
  const [lastDet, setLastDet] = useState(defaultLastDet);

  const [events, setEvents] = useState<DetectionEvent[]>(defaultEvents);
  const [filter, setFilter] = useState<HistoryFilter>('Toutes');
  const [period, setPeriod] = useState<Period>("Aujourd'hui");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const [settings, setSettings] = useState<Settings>(defaultSettings);

  const [info, setInfo] = useState<InfoPanel>(null);

  const [onb, setOnb] = useState<OnboardingStep>(null);
  const [simPerms, setSimPerms] = useState(defaultSimulatedPermissions);
  const cameraPermission = useCameraPermission();

  const perms: Permissions = useMemo(() => ({
    cam: cameraPermission.hasPermission,
    mic: simPerms.mic,
    notif: simPerms.notif,
  }), [cameraPermission.hasPermission, simPerms]);

  // ── hydrate from disk ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, p, ev, dt, ld, onboarded] = await Promise.all([
        storage.loadSettings(),
        storage.loadPerms(),
        storage.loadEvents(),
        storage.loadDetToday(),
        storage.loadLastDet(),
        storage.loadOnboardingComplete(),
      ]);
      if (cancelled) return;
      if (s) setSettings(s);
      if (p) setSimPerms(p);
      if (ev) setEvents(ev);
      if (typeof dt === 'number') setDetToday(dt);
      if (ld) setLastDet(ld);
      setOnb(onboarded ? null : 'intro');
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── persist on change (skip the initial hydration write) ───────────
  useEffect(() => { if (hydrated) storage.saveSettings(settings); }, [hydrated, settings]);
  useEffect(() => { if (hydrated) storage.savePerms(simPerms); }, [hydrated, simPerms]);
  useEffect(() => { if (hydrated) storage.saveEvents(events); }, [hydrated, events]);
  useEffect(() => { if (hydrated) storage.saveDetToday(detToday); }, [hydrated, detToday]);
  useEffect(() => { if (hydrated) storage.saveLastDet(lastDet); }, [hydrated, lastDet]);

  // ── live clock, independent of monitoring ───────────────────────────
  useEffect(() => {
    const iv = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── detection: fed by the camera's frame processor ──────────────────
  const pushEvent = useCallback((kind: DetectionKind, dur: number, c: number) => {
    const hm = pad(new Date().getHours()) + ':' + pad(new Date().getMinutes());
    setDetToday(v => v + 1);
    setLastDet(hm);
    setEvents(evs => [
      { id: Date.now(), kind, timestamp: Date.now(), dur, conf: c, size: formatMo(dur) },
      ...evs,
    ]);
  }, []);

  // Active-session bookkeeping. Refs (not state) because reportDetections
  // fires many times a second and only some updates should trigger a render.
  const sessionKindRef = useRef<DetectionKind | null>(null);
  const sessionStartRef = useRef(0);
  const sessionMaxConfRef = useRef(0);
  const missStreakRef = useRef(0);

  const endSession = useCallback(() => {
    const kind = sessionKindRef.current;
    if (!kind) return;
    const dur = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000));
    pushEvent(kind, dur, Math.round(sessionMaxConfRef.current * 100));
    sessionKindRef.current = null;
    missStreakRef.current = 0;
    setDet(null);
    setBox(null);
    setRecSec(0);
  }, [pushEvent]);

  const reportDetections = useCallback((detections: FrameDetection[]) => {
    const best = detections[0];

    if (best && (sessionKindRef.current == null || sessionKindRef.current === best.kind)) {
      missStreakRef.current = 0;
      if (sessionKindRef.current == null) {
        sessionKindRef.current = best.kind;
        sessionStartRef.current = Date.now();
        sessionMaxConfRef.current = best.confidence;
        setRecSec(0);
      } else {
        sessionMaxConfRef.current = Math.max(sessionMaxConfRef.current, best.confidence);
        setRecSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
      setDet(best.kind);
      setConf(Math.round(best.confidence * 100));
      setBox(best.box);
      return;
    }

    // Nothing matching this frame (or a different kind while one is already active): count a miss.
    if (sessionKindRef.current != null) {
      missStreakRef.current += 1;
      if (missStreakRef.current >= MISS_LIMIT) endSession();
    }
  }, [endSession]);

  const toggleMonitoring = useCallback(() => {
    setMonitoring(m => {
      if (m) endSession();
      return !m;
    });
  }, [endSession]);

  // ── history ──────────────────────────────────────────────────────────
  const togglePeriodOpen = useCallback(() => setPeriodOpen(v => !v), []);
  const selectEvent = useCallback((id: number | null) => setSelected(id), []);

  const askDelete = useCallback(() => setConfirmDelete(true), []);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const doDelete = useCallback(() => {
    setEvents(evs => evs.filter(e => e.id !== selected));
    setSelected(null);
    setConfirmDelete(false);
  }, [selected]);

  const askWipe = useCallback(() => setConfirmWipe(true), []);
  const cancelWipe = useCallback(() => setConfirmWipe(false), []);
  const doWipe = useCallback(() => { setEvents([]); setConfirmWipe(false); }, []);
  const wipeAllVideos = askWipe;

  // ── setup ────────────────────────────────────────────────────────────
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...patch }));
  }, []);

  const toggleSection = useCallback((key: keyof ExpandedSections) => {
    setSettings(s => ({ ...s, exp: { ...s.exp, [key]: !s.exp[key] } }));
  }, []);

  const cycleCamera = useCallback(() => patchSettings({ camera: cycle(CAMERA_OPTIONS, settings.camera) }), [patchSettings, settings.camera]);
  const cyclePre = useCallback(() => patchSettings({ pre: cycle(PRE_OPTIONS, settings.pre) }), [patchSettings, settings.pre]);
  const cyclePost = useCallback(() => patchSettings({ post: cycle(POST_OPTIONS, settings.post) }), [patchSettings, settings.post]);
  const cycleMax = useCallback(() => patchSettings({ max: cycle(MAX_OPTIONS, settings.max) }), [patchSettings, settings.max]);
  const cycleQuality = useCallback(() => patchSettings({ quality: cycle(QUALITY_OPTIONS, settings.quality) }), [patchSettings, settings.quality]);

  const toggleBoot = useCallback(() => patchSettings({ boot: !settings.boot }), [patchSettings, settings.boot]);
  const toggleNight = useCallback(() => patchSettings({ night: !settings.night }), [patchSettings, settings.night]);
  const togglePerson = useCallback(() => patchSettings({ person: !settings.person }), [patchSettings, settings.person]);
  const toggleAnimal = useCallback(() => patchSettings({ animal: !settings.animal }), [patchSettings, settings.animal]);
  const toggleAutoDel = useCallback(() => patchSettings({ autoDel: !settings.autoDel }), [patchSettings, settings.autoDel]);
  const toggleNotif = useCallback(() => patchSettings({ notif: !settings.notif }), [patchSettings, settings.notif]);
  const toggleNotifDet = useCallback(() => patchSettings({ notifDet: !settings.notifDet }), [patchSettings, settings.notifDet]);
  const toggleSound = useCallback(() => patchSettings({ sound: !settings.sound }), [patchSettings, settings.sound]);
  const toggleVibe = useCallback(() => patchSettings({ vibe: !settings.vibe }), [patchSettings, settings.vibe]);

  const setSensitivity = useCallback((s: Sensitivity) => patchSettings({ sens: s }), [patchSettings]);
  const setThreshold = useCallback((v: number) => patchSettings({ threshold: v }), [patchSettings]);
  const setRetention = useCallback((r: Retention) => patchSettings({ retention: r }), [patchSettings]);

  // ── info panel ───────────────────────────────────────────────────────
  const openInfo = useCallback((panel: Exclude<InfoPanel, null>) => setInfo(panel), []);
  const closeInfo = useCallback(() => setInfo(null), []);

  // ── onboarding ───────────────────────────────────────────────────────
  const onbNext = useCallback(() => setOnb('perms'), []);
  const onbFinish = useCallback(() => {
    setOnb(null);
    storage.saveOnboardingComplete(true);
  }, []);
  const grantPermission = useCallback((key: keyof Permissions) => {
    if (key === 'cam') {
      cameraPermission.requestPermission();
      return;
    }
    setSimPerms(p => ({ ...p, [key]: true }));
  }, [cameraPermission]);

  const value = useMemo<AppStateValue>(() => ({
    hydrated,
    tab, setTab,
    monitoring, det, conf, box, recSec, clock, detToday, lastDet, toggleMonitoring, reportDetections,
    events, filter, setFilter, period, setPeriod, periodOpen, togglePeriodOpen, selected, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete,
    confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleBoot, toggleNight, togglePerson, toggleAnimal,
    setSensitivity, setThreshold, cyclePre, cyclePost, cycleMax, cycleQuality, setRetention,
    toggleAutoDel, toggleNotif, toggleNotifDet, toggleSound, toggleVibe, wipeAllVideos,
    info, openInfo, closeInfo,
    onb, perms, onbNext, onbFinish, grantPermission,
  }), [
    hydrated, tab, monitoring, det, conf, box, recSec, clock, detToday, lastDet, toggleMonitoring, reportDetections,
    events, filter, period, periodOpen, togglePeriodOpen, selected, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete, confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleBoot, toggleNight, togglePerson, toggleAnimal,
    setSensitivity, setThreshold, cyclePre, cyclePost, cycleMax, cycleQuality, setRetention,
    toggleAutoDel, toggleNotif, toggleNotifDet, toggleSound, toggleVibe, wipeAllVideos,
    info, openInfo, closeInfo, onb, perms, onbNext, onbFinish, grantPermission,
  ]);

  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function useFilteredEvents(): { shown: DetectionEvent[]; totalCount: number } {
  const { events, filter, period } = useAppState();
  const shown = useMemo(() => events.filter(e => {
    if (filter === 'Personnes' && e.kind !== 'Personne') return false;
    if (filter === 'Animaux' && e.kind !== 'Animal') return false;
    const diff = daysAgo(e.timestamp);
    if (period === "Aujourd'hui" && diff !== 0) return false;
    if (period === '7 jours' && diff > 6) return false;
    if (period === '30 jours' && diff > 29) return false;
    return true;
  }), [events, filter, period]);
  return { shown, totalCount: events.length };
}
