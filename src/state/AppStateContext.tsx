import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { Camera as VisionCamera } from 'react-native-vision-camera';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import {
  Camera, DetectionEvent, DetectionKind, ExpandedSections, HistoryFilter, InfoPanel,
  MaxDuration, OnboardingStep, Period, Permissions, PostRoll, Quality,
  Retention, Sensitivity, Settings, StorageInfo, Tab,
} from './types';
import {
  defaultDetToday, defaultEvents, defaultLastDet, defaultSettings,
} from './defaults';
import { dropStaleKeys, storage } from './storage';
import { daysAgo, formatClock, pad } from '../utils/date';
import { DetectionBox, FrameDetection } from '../ml/types';
import { confirmedTracks, primaryTrack, Track, updateTracks } from '../ml/tracker';
import { Clip, useRecorder } from '../recording/useRecorder';
import {
  bytesToReclaim, eventsToReclaim, expiredEvents, MIN_FREE_BYTES, postRollMs, sameDay,
  todayCount, totalBytes,
} from '../recording/library';
import { deleteFiles, orphanedRecordings, storageInfo } from '../recording/videoStore';
import {
  hasNotificationPermission, requestNotificationPermission, startForegroundService,
  stopForegroundService,
} from '../surveillance/foregroundService';

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
  /** Every confirmed subject currently in frame, for the overlay. */
  tracks: Track[];
  /** Which of those tracks is driving the recording session. */
  primaryTrackId: number | null;
  /** Aspect ratio (w/h) of the uprighted camera frame, for mapping boxes onto the preview. */
  frameAspect: number;
  recSec: number;
  clock: string;
  detToday: number;
  lastDet: string;
  /** True only while a clip is actually being written to disk. */
  recording: boolean;
  /** Last recording failure, surfaced in the viewfinder instead of being swallowed. */
  recError: string | null;
  storage: StorageInfo;
  /** Passed down to the Camera so the recorder can drive it. */
  cameraRef: React.RefObject<VisionCamera | null>;
  toggleMonitoring: () => void;
  /** Called from the camera frame-processor (JS thread) with this frame's qualifying detections. */
  reportDetections: (detections: FrameDetection[], frameAspect: number) => void;

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
  toggleAutoZoom: () => void;
  setSensitivity: (s: Sensitivity) => void;
  setThreshold: (v: number) => void;
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
const POST_OPTIONS: PostRoll[] = ['5 s', '10 s', '30 s'];
const MAX_OPTIONS: MaxDuration[] = ['1 min', '2 min', '5 min'];
const QUALITY_OPTIONS: Quality[] = ['720p', '1080p', '4K'];

// Sessions now follow the tracker: one opens when a subject is *confirmed*
// (seen on consecutive frames) and closes when every track has been dropped,
// which is what stops a single lucky frame from writing a history event and
// stops a brief occlusion from splitting one passage into two.

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState<Tab>('cam');

  const [monitoring, setMonitoring] = useState(false);
  const [det, setDet] = useState<DetectionKind | null>(null);
  const [conf, setConf] = useState(0);
  const [box, setBox] = useState<DetectionBox | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [primaryTrackId, setPrimaryTrackId] = useState<number | null>(null);
  const [frameAspect, setFrameAspect] = useState(9 / 16);
  const [recSec, setRecSec] = useState(0);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [detToday, setDetToday] = useState(defaultDetToday);
  const [lastDet, setLastDet] = useState(defaultLastDet);
  const [recError, setRecError] = useState<string | null>(null);
  const [store, setStore] = useState<StorageInfo>({ used: 0, free: 0, total: 0 });

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
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  // POST_NOTIFICATIONS has no vision-camera hook; it is read once and then
  // updated by grantPermission. Nothing else can change it while we run.
  const [notifGranted, setNotifGranted] = useState(false);
  useEffect(() => {
    let cancelled = false;
    hasNotificationPermission().then(granted => {
      if (!cancelled) setNotifGranted(granted);
    });
    return () => { cancelled = true; };
  }, []);

  const perms: Permissions = useMemo(() => ({
    cam: cameraPermission.hasPermission,
    mic: microphonePermission.hasPermission,
    notif: notifGranted,
  }), [cameraPermission.hasPermission, microphonePermission.hasPermission, notifGranted]);

  // ── hydrate from disk ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, ev, dt, ld, onboarded] = await Promise.all([
        storage.loadSettings(),
        storage.loadEvents(),
        storage.loadDetToday(),
        storage.loadLastDet(),
        storage.loadOnboardingComplete(),
      ]);
      if (cancelled) return;
      if (s) setSettings(s);
      if (ev) setEvents(ev);
      setDetToday(todayCount(dt, Date.now()));
      if (ld) setLastDet(ld);
      setOnb(onboarded ? null : 'intro');
      setHydrated(true);

      // Clips left behind by a crash between the encoder closing a file and the
      // event being written would otherwise take up space nothing accounts for.
      const orphans = await orphanedRecordings((ev ?? []).map(e => e.path));
      if (orphans.length) await deleteFiles(orphans);
      await dropStaleKeys();
    })();
    return () => { cancelled = true; };
  }, []);

  // ── persist on change (skip the initial hydration write) ───────────
  useEffect(() => { if (hydrated) storage.saveSettings(settings); }, [hydrated, settings]);
  useEffect(() => { if (hydrated) storage.saveEvents(events); }, [hydrated, events]);
  useEffect(() => {
    if (hydrated) storage.saveDetToday({ count: detToday, day: Date.now() });
  }, [hydrated, detToday]);
  useEffect(() => { if (hydrated) storage.saveLastDet(lastDet); }, [hydrated, lastDet]);

  // ── live clock, independent of monitoring ───────────────────────────
  const dayRef = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setClock(formatClock(new Date(now)));
      // Roll the daily counter over at midnight for a session left running
      // overnight — hydration alone would only catch it on the next launch.
      if (!sameDay(dayRef.current, now)) {
        dayRef.current = now;
        setDetToday(0);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── recording ────────────────────────────────────────────────────────
  const cameraRef = useRef<VisionCamera | null>(null);

  // Active-session bookkeeping. Refs (not state) because reportDetections
  // fires many times a second and only some updates should trigger a render.
  const sessionKindRef = useRef<DetectionKind | null>(null);
  const sessionStartRef = useRef(0);
  const sessionMaxConfRef = useRef(0);
  const tracksRef = useRef<Track[]>([]);
  /** Set while a stop is in flight, so the arriving clip knows what it belongs to. */
  const pendingRef = useRef<{ kind: DetectionKind; dur: number; conf: number } | null>(null);
  /** Post-roll: keep rolling for a moment after the last subject leaves. */
  const postRollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitEvent = useCallback((
    kind: DetectionKind, dur: number, c: number, clip: Clip | null,
  ) => {
    const now = Date.now();
    setDetToday(v => v + 1);
    setLastDet(pad(new Date(now).getHours()) + ':' + pad(new Date(now).getMinutes()));
    setEvents(evs => [
      {
        id: now,
        kind,
        timestamp: now,
        // Prefer the encoder's own duration: it counts what is actually in the
        // file, including the post-roll, which our session timer does not.
        dur: clip && clip.duration > 0 ? Math.round(clip.duration) : dur,
        conf: c,
        path: clip ? clip.path : null,
        bytes: clip ? clip.bytes : 0,
      },
      ...evs,
    ]);
  }, []);

  const clearSession = useCallback(() => {
    sessionKindRef.current = null;
    setDet(null);
    setBox(null);
    setRecSec(0);
  }, []);

  const sessionMeta = useCallback(() => ({
    kind: sessionKindRef.current as DetectionKind,
    dur: Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000)),
    conf: Math.round(sessionMaxConfRef.current * 100),
  }), []);

  const onClip = useCallback((clip: Clip) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      commitEvent(pending.kind, pending.dur, pending.conf, clip);
      return;
    }
    // No pending stop: the duration cap cut the clip while the subject is still
    // in frame. Close this segment — the next frame reopens a session, so a long
    // passage is stored as consecutive clips rather than one unbounded file.
    if (sessionKindRef.current != null) {
      const meta = sessionMeta();
      commitEvent(meta.kind, meta.dur, meta.conf, clip);
      clearSession();
    }
  }, [clearSession, commitEvent, sessionMeta]);

  const recorder = useRecorder({
    cameraRef,
    enabled: monitoring && perms.cam,
    max: settings.max,
    onClip,
    onError: setRecError,
  });
  // Depend on the two callbacks rather than the recorder object: it is a fresh
  // literal every render, and `reportDetections` feeds the frame processor's
  // dependency list — an identity that churned every render would rebuild the
  // worklet several times a second.
  const { isRecording, start: startRecording, stop: stopRecording } = recorder;

  // Same reason: free space changes whenever the library is re-measured, and
  // reading it through a ref keeps `reportDetections` stable across those.
  const freeSpaceRef = useRef(0);
  useEffect(() => { freeSpaceRef.current = store.free; }, [store.free]);

  const cancelPostRoll = useCallback(() => {
    if (postRollRef.current) {
      clearTimeout(postRollRef.current);
      postRollRef.current = null;
    }
  }, []);

  /** Ends the session now, without waiting out the post-roll. */
  const endSession = useCallback(() => {
    if (sessionKindRef.current == null) return;
    cancelPostRoll();
    const meta = sessionMeta();
    clearSession();
    if (stopRecording()) {
      pendingRef.current = meta;    // the clip will carry the event
    } else {
      // Nothing was recording (no permission, disk full, camera gone). The
      // sighting still happened, so keep it — just without a file.
      commitEvent(meta.kind, meta.dur, meta.conf, null);
    }
  }, [cancelPostRoll, clearSession, commitEvent, sessionMeta, stopRecording]);

  const reportDetections = useCallback((detections: FrameDetection[], aspect: number) => {
    setFrameAspect(aspect);

    const next = updateTracks(tracksRef.current, detections, Date.now());
    tracksRef.current = next;
    const visible = confirmedTracks(next);
    setTracks(visible);

    const primary = primaryTrack(next);
    setPrimaryTrackId(primary ? primary.id : null);

    if (primary) {
      cancelPostRoll();
      if (sessionKindRef.current == null) {
        sessionKindRef.current = primary.kind;
        sessionStartRef.current = Date.now();
        sessionMaxConfRef.current = primary.maxConfidence;
        setRecSec(0);
        // Refuse to start on a nearly full volume rather than letting the
        // encoder fail mid-clip and lose the whole passage.
        const free = freeSpaceRef.current;
        if (free > 0 && free < MIN_FREE_BYTES) {
          setRecError('Espace insuffisant pour enregistrer');
        } else {
          setRecError(null);
          startRecording();
        }
      } else {
        sessionMaxConfRef.current = Math.max(sessionMaxConfRef.current, primary.maxConfidence);
        setRecSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
      setDet(primary.kind);
      setConf(Math.round(primary.confidence * 100));
      setBox(primary.box);
      return;
    }

    // No confirmed subject left in frame. The tracker has already given each one
    // its grace period; the post-roll now keeps the camera rolling a little
    // longer so the clip doesn't cut the moment someone steps out of frame.
    if (sessionKindRef.current != null && postRollRef.current == null) {
      postRollRef.current = setTimeout(() => {
        postRollRef.current = null;
        endSession();
      }, postRollMs(settings.post));
    }
  }, [cancelPostRoll, endSession, settings.post, startRecording]);

  const toggleMonitoring = useCallback(() => {
    // Closing the session has to happen outside the updater: React may invoke
    // an updater twice, which would commit the same event — and its clip — twice.
    if (monitoring) {
      endSession();
      tracksRef.current = [];
      setTracks([]);
    }
    setMonitoring(m => !m);
  }, [endSession, monitoring]);

  useEffect(() => cancelPostRoll, [cancelPostRoll]);

  // The foreground service is what lets the camera keep running once the app
  // leaves the screen; without it Android cuts capture and may kill the process.
  useEffect(() => {
    if (monitoring) startForegroundService();
    else stopForegroundService();
  }, [monitoring]);

  // Leaving a "surveillance active" notification behind after the process is
  // gone would be worse than not showing one at all.
  useEffect(() => stopForegroundService, []);

  // ── retention & disk pressure ────────────────────────────────────────
  // Runs whenever the library changes: drops clips past the retention window,
  // then — if auto-delete is on and the volume is nearly full — the oldest
  // clips until there is room again. Both prune `events`, which re-runs this
  // effect until there is nothing left to drop.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    (async () => {
      const expired = expiredEvents(events, settings.retention, Date.now());
      if (expired.length) {
        const ids = new Set(expired.map(e => e.id));
        await deleteFiles(expired.map(e => e.path));
        if (!cancelled) setEvents(evs => evs.filter(e => !ids.has(e.id)));
        return;
      }

      const disk = await storageInfo(totalBytes(events));
      if (cancelled) return;
      setStore(disk);

      if (!settings.autoDel || disk.free <= 0) return;
      const needed = bytesToReclaim(disk.free);
      if (needed <= 0) return;

      const victims = eventsToReclaim(events, needed);
      if (!victims.length) return;
      const ids = new Set(victims.map(e => e.id));
      await deleteFiles(victims.map(e => e.path));
      if (!cancelled) setEvents(evs => evs.filter(e => !ids.has(e.id)));
    })();

    return () => { cancelled = true; };
  }, [hydrated, events, settings.retention, settings.autoDel]);

  // ── history ──────────────────────────────────────────────────────────
  const togglePeriodOpen = useCallback(() => setPeriodOpen(v => !v), []);
  const selectEvent = useCallback((id: number | null) => setSelected(id), []);

  const askDelete = useCallback(() => setConfirmDelete(true), []);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const doDelete = useCallback(() => {
    const victim = events.find(e => e.id === selected);
    if (victim) deleteFiles([victim.path]);
    setEvents(evs => evs.filter(e => e.id !== selected));
    setSelected(null);
    setConfirmDelete(false);
  }, [events, selected]);

  const askWipe = useCallback(() => setConfirmWipe(true), []);
  const cancelWipe = useCallback(() => setConfirmWipe(false), []);
  const doWipe = useCallback(() => {
    deleteFiles(events.map(e => e.path));
    setEvents([]);
    setConfirmWipe(false);
  }, [events]);
  const wipeAllVideos = askWipe;

  // ── setup ────────────────────────────────────────────────────────────
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...patch }));
  }, []);

  const toggleSection = useCallback((key: keyof ExpandedSections) => {
    setSettings(s => ({ ...s, exp: { ...s.exp, [key]: !s.exp[key] } }));
  }, []);

  const cycleCamera = useCallback(() => patchSettings({ camera: cycle(CAMERA_OPTIONS, settings.camera) }), [patchSettings, settings.camera]);
  const cyclePost = useCallback(() => patchSettings({ post: cycle(POST_OPTIONS, settings.post) }), [patchSettings, settings.post]);
  const cycleMax = useCallback(() => patchSettings({ max: cycle(MAX_OPTIONS, settings.max) }), [patchSettings, settings.max]);
  const cycleQuality = useCallback(() => patchSettings({ quality: cycle(QUALITY_OPTIONS, settings.quality) }), [patchSettings, settings.quality]);

  const toggleBoot = useCallback(() => patchSettings({ boot: !settings.boot }), [patchSettings, settings.boot]);
  const toggleNight = useCallback(() => patchSettings({ night: !settings.night }), [patchSettings, settings.night]);
  const togglePerson = useCallback(() => patchSettings({ person: !settings.person }), [patchSettings, settings.person]);
  const toggleAnimal = useCallback(() => patchSettings({ animal: !settings.animal }), [patchSettings, settings.animal]);
  const toggleAutoZoom = useCallback(() => patchSettings({ autoZoom: !settings.autoZoom }), [patchSettings, settings.autoZoom]);
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
    if (key === 'mic') {
      microphonePermission.requestPermission();
      return;
    }
    requestNotificationPermission().then(setNotifGranted);
  }, [cameraPermission, microphonePermission]);

  const value = useMemo<AppStateValue>(() => ({
    hydrated,
    tab, setTab,
    monitoring, det, conf, box, tracks, primaryTrackId, frameAspect, recSec, clock, detToday, lastDet,
    recording: isRecording, recError, storage: store, cameraRef,
    toggleMonitoring, reportDetections,
    events, filter, setFilter, period, setPeriod, periodOpen, togglePeriodOpen, selected, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete,
    confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleBoot, toggleNight, togglePerson, toggleAnimal, toggleAutoZoom,
    setSensitivity, setThreshold, cyclePost, cycleMax, cycleQuality, setRetention,
    toggleAutoDel, toggleNotif, toggleNotifDet, toggleSound, toggleVibe, wipeAllVideos,
    info, openInfo, closeInfo,
    onb, perms, onbNext, onbFinish, grantPermission,
  }), [
    hydrated, tab, monitoring, det, conf, box, tracks, primaryTrackId, frameAspect, recSec, clock, detToday, lastDet,
    isRecording, recError, store, toggleMonitoring, reportDetections,
    events, filter, period, periodOpen, togglePeriodOpen, selected, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete, confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleBoot, toggleNight, togglePerson, toggleAnimal, toggleAutoZoom,
    setSensitivity, setThreshold, cyclePost, cycleMax, cycleQuality, setRetention,
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
