import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { Camera as VisionCamera } from 'react-native-vision-camera';
import { Camera as CameraModule, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import {
  Camera, DetectionEvent, DetectionKind, ExpandedSections, HistoryFilter, InfoPanel,
  MaxDuration, OnboardingStep, Period, Permissions, PostRoll, Quality,
  Retention, Sensitivity, Settings, StorageInfo, Tab, VolumeSpace,
} from './types';
import {
  defaultDetToday, defaultEvents, defaultLastDet, defaultSettings,
} from './defaults';
import { dropStaleKeys, storage } from './storage';
import { pad } from '../utils/date';
import { useLatest } from '../utils/useLatest';
import { FrameDetection } from '../ml/types';
import { confirmedTracksIfChanged, primaryTrack, Track, updateTracks } from '../ml/tracker';
import { Clip, useRecorder } from '../recording/useRecorder';
import {
  bytesToReclaim, clipFileName, clipOutcome, eventsToReclaim, expiredEvents, MIN_FREE_BYTES,
  nextEventId, periodRange, postRollMs, sameDay, todayCount, totalBytes,
} from '../recording/library';
import {
  deleteFile, deleteFiles, orphanedRecordings, renameRecording, volumeSpace,
} from '../recording/videoStore';
import {
  dismissDetectionAlert, foregroundServiceError, hasNotificationPermission, notifyDetection,
  openDetectionChannelSettings, requestNotificationPermission, startForegroundService,
  stopForegroundService,
} from '../surveillance/foregroundService';
import { alertContent, shouldAlert } from '../surveillance/alerts';

interface AppStateValue {
  hydrated: boolean;

  // navigation
  tab: Tab;
  setTab: (t: Tab) => void;

  // surveillance
  monitoring: boolean;
  /** What the current session is recording, or null. Survives the post-roll. */
  det: DetectionKind | null;
  detToday: number;
  lastDet: string;
  /** True only while a clip is actually being written to disk. */
  recording: boolean;
  /** Last recording failure, surfaced in the viewfinder instead of being swallowed. */
  recError: string | null;
  storage: StorageInfo;
  /** Passed down to the Camera so the recorder can drive it. */
  cameraRef: React.RefObject<VisionCamera | null>;
  /** Camera runtime errors and model load failures, reported from CameraFeed. */
  reportCameraProblem: (message: string | null) => void;
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
  /** The event `selected` names, resolved once for every consumer that needs it. */
  selectedEvent: DetectionEvent | null;
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
  toggleResumeOnLaunch: () => void;
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
  /** Sound and vibration live in Android's channel settings, not here. */
  openAlertSoundSettings: () => void;
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

/**
 * State that changes at the frame-processor rate, kept out of {@link AppStateValue}.
 *
 * Everything here is redrawn up to five times a second while surveillance runs.
 * Carrying it in the main context meant every consumer — the camera, the tab
 * bar, the sheets, the confirm dialogs — re-rendered at that rate, since a new
 * context value re-renders all of its consumers regardless of which field
 * changed. Only `DetectionOverlay` and `RecTimer` read any of it.
 */
export interface ViewfinderState {
  /** Every confirmed subject currently in frame, for the overlay. */
  tracks: Track[];
  /** Which of those tracks is driving the recording session. */
  primaryTrackId: number | null;
  /** Aspect ratio (w/h) of the uprighted camera frame, for mapping boxes onto the preview. */
  frameAspect: number;
  recSec: number;
}

/** The setters `reportDetections` drives, handed up by `ViewfinderProvider`. */
interface ViewfinderSink {
  setTracks: (update: (previous: Track[]) => Track[]) => void;
  setPrimaryTrackId: (id: number | null) => void;
  setFrameAspect: (aspect: number) => void;
  setRecSec: (seconds: number) => void;
}

const AppStateCtx = createContext<AppStateValue | null>(null);
const ViewfinderCtx = createContext<ViewfinderState | null>(null);

/**
 * Owns the state that changes at the frame-processor rate.
 *
 * Splitting the context stopped every *consumer* re-rendering on a frame, but
 * the state itself still lived in `AppStateProvider`, so each detection
 * re-executed that 700-line body — forty `useCallback` dependency arrays and a
 * fifty-entry `useMemo` list, five times a second, to move one box. Holding it
 * here means a frame re-renders these twenty lines instead, and the parent's
 * `children` element is untouched so the app subtree below bails out.
 */
function ViewfinderProvider({
  sink, children,
}: { sink: React.RefObject<ViewfinderSink | null>; children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [primaryTrackId, setPrimaryTrackId] = useState<number | null>(null);
  const [frameAspect, setFrameAspect] = useState(9 / 16);
  const [recSec, setRecSec] = useState(0);

  // `useState` setters are stable, so this is built once and the registration
  // never re-runs. Effects flush child-first, but a frame cannot be processed
  // before the camera below has mounted *and* the native session has delivered
  // one asynchronously — well after this commit — so the sink is always live by
  // the time `reportDetections` fires.
  const setters = useMemo<ViewfinderSink>(
    () => ({ setTracks, setPrimaryTrackId, setFrameAspect, setRecSec }),
    [],
  );
  useEffect(() => {
    sink.current = setters;
    return () => { sink.current = null; };
  }, [setters, sink]);

  const value = useMemo<ViewfinderState>(
    () => ({ tracks, primaryTrackId, frameAspect, recSec }),
    [tracks, primaryTrackId, frameAspect, recSec],
  );

  return <ViewfinderCtx.Provider value={value}>{children}</ViewfinderCtx.Provider>;
}

function cycle<T>(options: readonly T[], current: T): T {
  const i = options.indexOf(current);
  return options[(i + 1) % options.length];
}

const CAMERA_OPTIONS: Camera[] = ['Arrière (1×)', 'Arrière (0,5×)', 'Avant'];
const POST_OPTIONS: PostRoll[] = ['5 s', '10 s', '30 s'];
const MAX_OPTIONS: MaxDuration[] = ['1 min', '2 min', '5 min'];
const QUALITY_OPTIONS: Quality[] = ['720p', '1080p', '4K'];

/**
 * How long surveillance has to keep running, *after its first frame*, before it
 * is worth resuming next launch.
 *
 * The countdown deliberately starts at the first frame rather than at the tap.
 * Everything fragile has to have already worked for a frame to arrive at all —
 * the foreground service, the camera session, the model, the frame-processor
 * worklet — and the clock used to start at hydration, which on a cold launch
 * spends its first 1.6 s behind the splash with no camera even mounted. A start
 * that never produces a frame now never asks to be repeated, which is the whole
 * point: `resumeOnLaunch` replaying a crash is what made this app unopenable.
 */
export const RESUME_ARM_MS = 8000;

/**
 * How often free space is re-measured, and auto-delete gets a chance to run.
 *
 * It used to ride the `events` array, so every detection cost a `getFSInfo`
 * round trip — a night of surveillance meant hundreds of them for a number
 * that only moves as clips are written. Reacting within half a minute is
 * enough: `MIN_FREE_BYTES` already refuses to open a recording on a volume
 * that is nearly full, so the disk cannot quietly overrun between sweeps.
 */
export const DISK_SWEEP_MS = 30_000;

// Sessions now follow the tracker: one opens when a subject is *confirmed*
// (seen on consecutive frames) and closes when every track has been dropped,
// which is what stops a single lucky frame from writing a history event and
// stops a brief occlusion from splitting one passage into two.

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  const [tab, setTab] = useState<Tab>('cam');

  const [monitoring, setMonitoring] = useState(false);
  /** True once the camera has delivered a frame for the current session. */
  const [sawFrame, setSawFrame] = useState(false);
  const sawFrameRef = useRef(false);
  const [det, setDet] = useState<DetectionKind | null>(null);
  // Frame-rate state lives in `ViewfinderProvider` below; the provider reaches
  // its setters through this sink, so a detection never re-renders this body.
  const viewfinder = useRef<ViewfinderSink | null>(null);
  const [detToday, setDetToday] = useState(defaultDetToday);
  const [lastDet, setLastDet] = useState(defaultLastDet);
  const [recError, setRecError] = useState<string | null>(null);
  const [volume, setVolume] = useState<VolumeSpace>({ free: 0, total: 0 });

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
      const [s, storedEvents, dt, ld, wasMonitoring, onboarded] = await Promise.all([
        storage.loadSettings(),
        storage.loadEvents(),
        storage.loadDetToday(),
        storage.loadLastDet(),
        storage.loadMonitoring(),
        storage.loadOnboardingComplete(),
      ]);
      if (cancelled) return;
      // Merged over the defaults rather than used as-is: a settings object
      // written by an older version is missing every field added since, and
      // spreading it whole would leave those undefined.
      const restored = s ? { ...defaultSettings, ...s } : defaultSettings;
      setSettings(restored);
      const ev = storedEvents.value;
      if (ev) {
        setEvents(ev);
        lastEventIdRef.current = ev.reduce((max, e) => Math.max(max, e.id), 0);
      }
      // A history we could not read is not an empty history. Both the orphan
      // sweep below and the write-back effect would treat it as one — the
      // sweep deleting every clip on disk, the write-back replacing the stored
      // list with `[]` — so a single unreadable key would destroy every
      // recording the user has, silently, at launch. Hold both off instead,
      // and say so rather than showing an empty Historique with no explanation.
      eventsWritableRef.current = storedEvents.ok;
      if (!storedEvents.ok) setRecError('Historique illisible : les vidéos sont conservées');
      setDetToday(todayCount(dt, Date.now()));
      if (ld) setLastDet(ld);
      setOnb(onboarded ? null : 'intro');

      // Surveillance picks up where it left off. Gated on the camera permission
      // because a foreground service of type camera cannot be started without
      // it, and on onboarding being done so a first launch is never hijacked.
      // Read imperatively rather than through the hook's value: this effect
      // must run exactly once, and depending on the hook would re-run the whole
      // hydration every time the permission changed.
      const camGranted = CameraModule.getCameraPermissionStatus() === 'granted';
      if (onboarded && restored.resumeOnLaunch && wasMonitoring && camGranted) {
        setMonitoring(true);
      }
      setHydrated(true);

      // Clips left behind by a crash between the encoder closing a file and the
      // event being written would otherwise take up space nothing accounts for.
      if (storedEvents.ok) {
        const orphans = await orphanedRecordings((ev ?? []).map(e => e.path));
        if (orphans.length) await deleteFiles(orphans);
      }
      await dropStaleKeys();
    })();
    return () => { cancelled = true; };
  }, []);

  // ── persist on change (skip the initial hydration write) ───────────
  useEffect(() => { if (hydrated) storage.saveSettings(settings); }, [hydrated, settings]);
  /** False once a read failed, so nothing overwrites a history we cannot see. */
  const eventsWritableRef = useRef(true);
  useEffect(() => {
    if (hydrated && eventsWritableRef.current) storage.saveEvents(events);
  }, [hydrated, events]);
  useEffect(() => {
    if (hydrated) storage.saveDetToday({ count: detToday, day: Date.now() });
  }, [hydrated, detToday]);
  useEffect(() => { if (hydrated) storage.saveLastDet(lastDet); }, [hydrated, lastDet]);
  /**
   * Remember that surveillance was on — but only once it has proved survivable.
   *
   * Writing it the instant the button is pressed turns any crash during startup
   * into a trap the user cannot get out of: the crash persists `true`, the next
   * launch auto-resumes because of it, and the app dies again before anyone can
   * reach the setting that would stop it. Arming the flag a few seconds in
   * means a start that fails never asks to be repeated, while a session that
   * ran fine and was cut short still comes back.
   */
  useEffect(() => {
    if (!hydrated) return undefined;
    if (!monitoring) {
      storage.saveMonitoring(false);
      return undefined;
    }
    // Nothing to arm until the camera has actually produced a frame.
    if (!sawFrame) return undefined;
    const arm = setTimeout(() => storage.saveMonitoring(true), RESUME_ARM_MS);
    return () => clearTimeout(arm);
  }, [hydrated, monitoring, sawFrame]);

  // ── midnight rollover ───────────────────────────────────────────────
  // The displayed clock is not state here: it changes every second and only one
  // Text renders it, so `LiveClock` owns its own tick. This effect keeps only
  // the part that is app state — rolling the daily counter over for a session
  // left running overnight, which hydration alone would catch a launch too late.
  const dayRef = useRef(Date.now());
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
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
  /** When the last detection alert went out, for the cooldown. */
  const lastAlertRef = useRef<number | null>(null);
  /**
   * Last event id minted. Owned here rather than derived from `events[0]`,
   * which would only be the highest id while the list happens to be sorted
   * newest-first — an invariant nothing enforces, least of all the bare
   * `JSON.parse` that restores it from disk.
   */
  const lastEventIdRef = useRef(0);

  const commitEvent = useCallback((
    kind: DetectionKind, dur: number, c: number, clip: Clip | null, at: number = Date.now(),
  ) => {
    const now = at;
    setDetToday(v => v + 1);
    setLastDet(pad(new Date(now).getHours()) + ':' + pad(new Date(now).getMinutes()));
    // Minted outside the updater: React may invoke an updater twice, and an id
    // that advanced on each invocation would not be the one that got committed.
    const id = nextEventId(lastEventIdRef.current, now);
    lastEventIdRef.current = id;
    setEvents(evs => [
      {
        id,
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
    viewfinder.current?.setRecSec(0);
  }, []);

  const sessionMeta = useCallback(() => ({
    kind: sessionKindRef.current as DetectionKind,
    dur: Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000)),
    conf: Math.round(sessionMaxConfRef.current * 100),
  }), []);

  /**
   * Files the finished clip against the detection that caused it, under a name
   * that says which and when.
   *
   * Every clip must end up either attached to an event or deleted. A recording
   * nothing refers to is a video of an empty room taking up a user's storage,
   * invisible in the app and only swept away at the next launch — this used to
   * be the silent third outcome here.
   */
  const onClip = useCallback((clip: Clip) => {
    const pending = pendingRef.current;
    pendingRef.current = null;

    // The duration cap can cut a clip while the subject is still in frame; the
    // next frame reopens a session, so a long passage becomes consecutive clips.
    const meta = pending ?? (sessionKindRef.current != null ? sessionMeta() : null);

    switch (clipOutcome(meta != null, clip.bytes)) {
      case 'discard':
        // A stop that raced the session ending, or the component going away
        // mid-clip. Nothing will ever point at this file.
        deleteFile(clip.path);
        return;

      case 'event-only':
        // The encoder produced an empty file. Keep the sighting, drop the husk:
        // an unplayable 0-byte row in the history is worse than none.
        if (!pending) clearSession();
        deleteFile(clip.path);
        commitEvent(meta!.kind, meta!.dur, meta!.conf, null);
        return;

      case 'attach': {
        if (!pending) clearSession();
        const at = Date.now();
        renameRecording(clip.path, clipFileName(meta!.kind, at)).then(path => {
          commitEvent(meta!.kind, meta!.dur, meta!.conf, { ...clip, path }, at);
        });
      }
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

  // Same reason: everything `reportDetections` reads that changes while it runs
  // goes through a ref, so its identity — and the worklet's — survives. Free
  // space comes from the measurement, not from `store`, which folds in a value
  // derived from `events` that this path has no use for.
  const freeSpaceRef = useLatest(volume.free);
  const settingsRef = useLatest(settings);

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
    // Through a ref so this stays a once-per-session write: `setSawFrame` is a
    // stable setter, so arming the resume flag costs the frame path nothing and
    // leaves this callback's identity — and the worklet's — untouched.
    if (!sawFrameRef.current) {
      sawFrameRef.current = true;
      setSawFrame(true);
    }
    viewfinder.current?.setFrameAspect(aspect);

    const next = updateTracks(tracksRef.current, detections, Date.now());
    tracksRef.current = next;
    // Keep the previous array when nothing moved: every other setter here
    // already bails on `Object.is`, so this is what makes a still scene free.
    viewfinder.current?.setTracks(prev => confirmedTracksIfChanged(prev, next));

    const primary = primaryTrack(next);
    viewfinder.current?.setPrimaryTrackId(primary ? primary.id : null);

    if (primary) {
      cancelPostRoll();
      if (sessionKindRef.current == null) {
        sessionKindRef.current = primary.kind;
        sessionStartRef.current = Date.now();
        sessionMaxConfRef.current = primary.maxConfidence;
        viewfinder.current?.setRecSec(0);
        // Refuse to start on a nearly full volume rather than letting the
        // encoder fail mid-clip and lose the whole passage.
        const free = freeSpaceRef.current;
        if (free > 0 && free < MIN_FREE_BYTES) {
          setRecError('Espace insuffisant pour enregistrer');
        } else {
          setRecError(null);
          startRecording();
        }

        // Alert on the *opening* of a session, not on the event written when it
        // closes: the point of a surveillance alert is that someone is there
        // now, not that someone was there for the last thirty seconds.
        const now = Date.now();
        if (shouldAlert(settingsRef.current, lastAlertRef.current, now)) {
          lastAlertRef.current = now;
          const { title, body } = alertContent(primary.kind, now);
          notifyDetection(title, body);
        }
      } else {
        sessionMaxConfRef.current = Math.max(sessionMaxConfRef.current, primary.maxConfidence);
        viewfinder.current?.setRecSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
      setDet(primary.kind);
      return;
    }

    // No confirmed subject left in frame. The tracker has already given each one
    // its grace period; the post-roll now keeps the camera rolling a little
    // longer so the clip doesn't cut the moment someone steps out of frame.
    if (sessionKindRef.current != null && postRollRef.current == null) {
      postRollRef.current = setTimeout(() => {
        postRollRef.current = null;
        endSession();
      }, postRollMs(settingsRef.current.post));
    }
  }, [cancelPostRoll, endSession, freeSpaceRef, settingsRef, startRecording]);

  const toggleMonitoring = useCallback(() => {
    // Closing the session has to happen outside the updater: React may invoke
    // an updater twice, which would commit the same event — and its clip — twice.
    if (monitoring) {
      endSession();
      tracksRef.current = [];
      viewfinder.current?.setTracks(() => []);
      sawFrameRef.current = false;
      setSawFrame(false);
      setMonitoring(false);
      return;
    }

    // Starting without the camera permission used to take the whole app down:
    // the foreground service claims the `camera` type, Android requires the
    // permission to be held at that moment, and the resulting SecurityException
    // is thrown inside the service — nowhere a caller can catch it. Ask instead.
    if (!cameraPermission.hasPermission) {
      setRecError('Autorisez la caméra pour démarrer la surveillance');
      cameraPermission.requestPermission().then(granted => {
        // Carry on rather than making the user find the button again.
        if (granted) {
          setRecError(null);
          setMonitoring(true);
        }
      });
      return;
    }
    setRecError(null);
    setMonitoring(true);
  }, [cameraPermission, endSession, monitoring]);

  useEffect(() => cancelPostRoll, [cancelPostRoll]);

  // The foreground service is what lets the camera keep running once the app
  // leaves the screen; without it Android cuts capture and may kill the process.
  useEffect(() => {
    if (monitoring) {
      startForegroundService();
      // The service starts on its own stack, so a refusal cannot come back as a
      // thrown error here. Read it back a moment later and say so, rather than
      // leaving surveillance looking active while Android has shut it down.
      const check = setTimeout(() => {
        const reason = foregroundServiceError();
        if (reason) setRecError(`Surveillance en arrière-plan refusée : ${reason}`);
      }, 1200);
      return () => clearTimeout(check);
    }
    stopForegroundService();
    // A "person detected" alert left standing after surveillance is off says
    // something that is no longer true.
    dismissDetectionAlert();
    lastAlertRef.current = null;
  }, [monitoring]);

  // Leaving a "surveillance active" notification behind after the process is
  // gone would be worse than not showing one at all.
  useEffect(() => stopForegroundService, []);

  // ── retention ────────────────────────────────────────────────────────
  // Rides the library, because deciding what has expired is pure arithmetic.
  // Pruning `events` re-runs this until there is nothing left to drop.
  useEffect(() => {
    if (!hydrated) return undefined;
    const expired = expiredEvents(events, settings.retention, Date.now());
    if (!expired.length) return undefined;

    let cancelled = false;
    const ids = new Set(expired.map(e => e.id));
    deleteFiles(expired.map(e => e.path)).then(() => {
      if (!cancelled) setEvents(evs => evs.filter(e => !ids.has(e.id)));
    });
    return () => { cancelled = true; };
  }, [hydrated, events, settings.retention]);

  // ── disk pressure ────────────────────────────────────────────────────
  // On its own cadence rather than the library's: measuring costs a native
  // call, and reclaiming is not something a single new clip can make urgent.
  const eventsRef = useLatest(events);
  const sweepDisk = useCallback(async () => {
    const space = await volumeSpace();
    setVolume(space);

    if (!settingsRef.current.autoDel || space.free <= 0) return;
    const needed = bytesToReclaim(space.free);
    if (needed <= 0) return;

    const victims = eventsToReclaim(eventsRef.current, needed);
    if (!victims.length) return;
    const ids = new Set(victims.map(e => e.id));
    await deleteFiles(victims.map(e => e.path));
    setEvents(evs => evs.filter(e => !ids.has(e.id)));
    // Re-measure rather than assume: the next sweep must decide against what
    // the volume actually reports, or it would keep reclaiming against a
    // free-space figure the deletions have already made stale.
    setVolume(await volumeSpace());
  }, [eventsRef, settingsRef]);

  useEffect(() => {
    if (!hydrated) return undefined;
    sweepDisk();
    const iv = setInterval(sweepDisk, DISK_SWEEP_MS);
    return () => clearInterval(iv);
  }, [hydrated, sweepDisk]);

  const store = useMemo<StorageInfo>(
    () => ({ ...volume, used: totalBytes(events) }),
    [events, volume],
  );

  // ── history ──────────────────────────────────────────────────────────
  const togglePeriodOpen = useCallback(() => setPeriodOpen(v => !v), []);
  const selectEvent = useCallback((id: number | null) => setSelected(id), []);

  const askDelete = useCallback(() => setConfirmDelete(true), []);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const selectedEvent = useMemo(
    () => events.find(e => e.id === selected) ?? null,
    [events, selected],
  );
  const doDelete = useCallback(() => {
    if (selectedEvent) deleteFile(selectedEvent.path);
    setEvents(evs => evs.filter(e => e.id !== selected));
    setSelected(null);
    setConfirmDelete(false);
    sweepDisk();
  }, [selected, selectedEvent, sweepDisk]);

  const askWipe = useCallback(() => setConfirmWipe(true), []);
  const cancelWipe = useCallback(() => setConfirmWipe(false), []);
  const doWipe = useCallback(() => {
    deleteFiles(events.map(e => e.path)).then(sweepDisk);
    setEvents([]);
    setConfirmWipe(false);
  }, [events, sweepDisk]);
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

  const toggleResumeOnLaunch = useCallback(
    () => patchSettings({ resumeOnLaunch: !settings.resumeOnLaunch }),
    [patchSettings, settings.resumeOnLaunch],
  );
  const toggleNight = useCallback(() => patchSettings({ night: !settings.night }), [patchSettings, settings.night]);
  const togglePerson = useCallback(() => patchSettings({ person: !settings.person }), [patchSettings, settings.person]);
  const toggleAnimal = useCallback(() => patchSettings({ animal: !settings.animal }), [patchSettings, settings.animal]);
  const toggleAutoZoom = useCallback(() => patchSettings({ autoZoom: !settings.autoZoom }), [patchSettings, settings.autoZoom]);
  const toggleAutoDel = useCallback(() => patchSettings({ autoDel: !settings.autoDel }), [patchSettings, settings.autoDel]);
  const toggleNotif = useCallback(() => patchSettings({ notif: !settings.notif }), [patchSettings, settings.notif]);
  const toggleNotifDet = useCallback(() => patchSettings({ notifDet: !settings.notifDet }), [patchSettings, settings.notifDet]);
  const openAlertSoundSettings = useCallback(() => openDetectionChannelSettings(), []);

  const reportCameraProblem = useCallback((message: string | null) => {
    // Only clears what it set: a camera that recovers must not wipe an unrelated
    // recording or foreground-service message.
    setRecError(prev => (message ?? (prev && /^(Caméra|Modèle)/.test(prev) ? null : prev)));
  }, []);

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
    monitoring, det, detToday, lastDet,
    recording: isRecording, recError, storage: store, cameraRef, reportCameraProblem,
    toggleMonitoring, reportDetections,
    events, filter, setFilter, period, setPeriod, periodOpen, togglePeriodOpen, selected, selectedEvent, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete,
    confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleResumeOnLaunch, toggleNight, togglePerson, toggleAnimal, toggleAutoZoom,
    setSensitivity, setThreshold, cyclePost, cycleMax, cycleQuality, setRetention,
    toggleAutoDel, toggleNotif, toggleNotifDet, openAlertSoundSettings, wipeAllVideos,
    info, openInfo, closeInfo,
    onb, perms, onbNext, onbFinish, grantPermission,
  }), [
    hydrated, tab, monitoring, det, detToday, lastDet,
    isRecording, recError, store, cameraRef, reportCameraProblem, toggleMonitoring, reportDetections,
    events, filter, period, periodOpen, togglePeriodOpen, selected, selectedEvent, selectEvent,
    confirmDelete, askDelete, cancelDelete, doDelete, confirmWipe, askWipe, cancelWipe, doWipe,
    settings, toggleSection, cycleCamera, toggleResumeOnLaunch, toggleNight, togglePerson, toggleAnimal, toggleAutoZoom,
    setSensitivity, setThreshold, cyclePost, cycleMax, cycleQuality, setRetention,
    toggleAutoDel, toggleNotif, toggleNotifDet, openAlertSoundSettings, wipeAllVideos,
    info, openInfo, closeInfo, onb, perms, onbNext, onbFinish, grantPermission,
  ]);

  return (
    <AppStateCtx.Provider value={value}>
      <ViewfinderProvider sink={viewfinder}>{children}</ViewfinderProvider>
    </AppStateCtx.Provider>
  );
}

export function useViewfinderState(): ViewfinderState {
  const ctx = useContext(ViewfinderCtx);
  if (!ctx) throw new Error('useViewfinderState must be used within AppStateProvider');
  return ctx;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateCtx);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function useFilteredEvents(): { shown: DetectionEvent[]; totalCount: number } {
  const { events, filter, period } = useAppState();
  const shown = useMemo(() => {
    const { from, to } = periodRange(period, Date.now());
    return events.filter(e => {
      if (filter === 'Personnes' && e.kind !== 'Personne') return false;
      if (filter === 'Animaux' && e.kind !== 'Animal') return false;
      return e.timestamp >= from && e.timestamp < to;
    });
  }, [events, filter, period]);
  return { shown, totalCount: events.length };
}
