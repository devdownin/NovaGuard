/**
 * Settings have to survive a restart and take effect while the app runs.
 *
 * Both halves have gone wrong here before: earlier builds shipped a whole
 * NOTIFICATIONS section whose switches were read only to render their own
 * label, and simulated permissions that no OS call backed. Nothing guarded
 * either, so the failure was invisible until someone tried the feature.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mountProvider } from '../testing/mountProvider';
import { defaultSettings } from '../src/state/defaults';
import { Settings } from '../src/state/types';
import { FrameDetection } from '../src/ml/types';
import { DEFAULT_TRACKER_OPTIONS } from '../src/ml/tracker';

jest.mock('../src/surveillance/foregroundService');

const SETTINGS_KEY = '@novaguard:settings';

const person = (x: number): FrameDetection =>
  ({ kind: 'Personne', confidence: 0.9, box: { x, y: 0.3, width: 0.2, height: 0.5 } });

async function storedSettings(): Promise<Settings> {
  return JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!);
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

it('persists every settings field, not just the one that changed', async () => {
  const { state } = await mountProvider();

  await ReactTestRenderer.act(async () => { state.toggleNight(); });

  const written = await storedSettings();
  // A partial write would silently reset the untouched fields to defaults on
  // the next launch, since hydration merges whatever it finds over them.
  expect(Object.keys(written).sort()).toEqual(Object.keys(defaultSettings).sort());
  expect(written.night).toBe(!defaultSettings.night);
});

it('writes each control back to disk', async () => {
  const { state } = await mountProvider();

  await ReactTestRenderer.act(async () => {
    state.togglePerson();
    state.toggleAnimal();
    state.toggleAutoZoom();
    state.toggleAutoDel();
    state.toggleNotif();
    state.toggleNotifDet();
    state.toggleResumeOnLaunch();
    state.setSensitivity('Haute');
    state.setThreshold(42);
    state.setRetention('1 jour');
    state.cycleCamera();
    state.cyclePost();
    state.cycleMax();
    state.cycleQuality();
  });

  expect(await storedSettings()).toMatchObject({
    person: !defaultSettings.person,
    animal: !defaultSettings.animal,
    autoZoom: !defaultSettings.autoZoom,
    autoDel: !defaultSettings.autoDel,
    notif: !defaultSettings.notif,
    notifDet: !defaultSettings.notifDet,
    resumeOnLaunch: !defaultSettings.resumeOnLaunch,
    sens: 'Haute',
    threshold: 42,
    retention: '1 jour',
  });
});

/**
 * `reportDetections` reads the post-roll through a ref so its identity stays
 * stable for the frame-processor worklet. A ref is exactly where a setting goes
 * stale, so this pins that it does not: the session must outlive the old delay.
 */
it('honours a post-roll changed mid-session', async () => {
  // Read through the handle, not a destructured snapshot: `handle.state` is
  // reassigned on every render, so `events` below has to come from it live.
  const handle = await mountProvider();
  const { state } = handle;

  await ReactTestRenderer.act(async () => { state.cyclePost(); }); // 10 s → 30 s

  await ReactTestRenderer.act(async () => {
    state.reportDetections([person(0.3)], 9 / 16);
    state.reportDetections([person(0.31)], 9 / 16);
  });

  // The tracker rides out DEFAULT_TRACKER_OPTIONS.dropAfterMs of not seeing the
  // subject before letting it go, so an empty frame alone does not end the
  // session — the post-roll only starts once the track is actually dropped.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(DEFAULT_TRACKER_OPTIONS.dropAfterMs + 100);
    state.reportDetections([], 9 / 16);
  });
  expect(handle.state.events).toHaveLength(0);

  // Past the old 10 s delay. A stale ref would have closed the session here.
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(15_000); });
  expect(handle.state.events).toHaveLength(0);

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(20_000); });
  expect(handle.state.events).toHaveLength(1);
});
