/**
 * Free space is measured on its own cadence, not on the library's.
 *
 * It used to ride the `events` array: every detection committed an event, which
 * re-ran the effect, which called `getFSInfo` — a native round trip, hundreds
 * of them over a night, for a number that only moves as clips are written.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as fs from '@dr.pogodin/react-native-fs';
import { DISK_SWEEP_MS } from '../src/state/AppStateContext';
import { mountProvider } from '../testing/mountProvider';
import { defaultSettings } from '../src/state/defaults';
import { LOW_SPACE_BYTES } from '../src/recording/library';
import { FrameDetection } from '../src/ml/types';
import { DEFAULT_TRACKER_OPTIONS } from '../src/ml/tracker';

jest.mock('../src/surveillance/foregroundService');

const mockFs = fs as jest.Mocked<typeof fs>;
const GB = 1024 * 1024 * 1024;

const person = (x: number): FrameDetection =>
  ({ kind: 'Personne', confidence: 0.9, box: { x, y: 0.3, width: 0.2, height: 0.5 } });

function reportSpace(free: number) {
  mockFs.getFSInfo.mockResolvedValue({
    freeSpace: free, totalSpace: 64 * GB, freeSpaceEx: free, totalSpaceEx: 64 * GB,
  } as never);
}

/** Drives one full detection session, which commits a history event. */
async function oneSession(report: (d: FrameDetection[], a: number) => void) {
  await ReactTestRenderer.act(async () => {
    report([person(0.3)], 9 / 16);
    report([person(0.31)], 9 / 16);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(DEFAULT_TRACKER_OPTIONS.dropAfterMs + 100);
    report([], 9 / 16);
  });
  // Past the default 10 s post-roll, which is what closes the session.
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(11_000); });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockFs.exists.mockResolvedValue(false);
  mockFs.readDir.mockResolvedValue([] as never);
  reportSpace(20 * GB);
});

afterEach(() => {
  jest.useRealTimers();
});

it('does not measure the volume when an event is committed', async () => {
  const handle = await mountProvider();
  const after = mockFs.getFSInfo.mock.calls.length;

  await oneSession(handle.state.reportDetections);
  await oneSession(handle.state.reportDetections);

  expect(handle.state.events.length).toBe(2);
  expect(mockFs.getFSInfo).toHaveBeenCalledTimes(after);
});

it('measures once at startup and then on its own cadence', async () => {
  await mountProvider();
  const atStartup = mockFs.getFSInfo.mock.calls.length;
  expect(atStartup).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(DISK_SWEEP_MS); });
  expect(mockFs.getFSInfo).toHaveBeenCalledTimes(atStartup + 1);

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(DISK_SWEEP_MS); });
  expect(mockFs.getFSInfo).toHaveBeenCalledTimes(atStartup + 2);
});

it('reclaims the oldest clips when the volume runs low, then re-measures', async () => {
  const now = Date.now();
  await AsyncStorage.setItem('@novaguard:settings', JSON.stringify({ ...defaultSettings, autoDel: true }));
  await AsyncStorage.setItem('@novaguard:events:v2', JSON.stringify([
    { id: 3, kind: 'Personne', timestamp: now - 3_000, dur: 5, conf: 90, path: '/c/new.mp4', bytes: 300 * 1024 * 1024 },
    { id: 2, kind: 'Personne', timestamp: now - 2 * 86_400_000, dur: 5, conf: 90, path: '/c/mid.mp4', bytes: 300 * 1024 * 1024 },
    { id: 1, kind: 'Animal', timestamp: now - 3 * 86_400_000, dur: 5, conf: 90, path: '/c/old.mp4', bytes: 300 * 1024 * 1024 },
  ]));
  // Under the low-space mark, so a sweep has to reclaim.
  reportSpace(LOW_SPACE_BYTES - 100 * 1024 * 1024);

  const handle = await mountProvider();
  await ReactTestRenderer.act(async () => {});

  // Oldest first, and only as many as the shortfall needs.
  expect(mockFs.unlink).toHaveBeenCalledWith('/c/old.mp4');
  expect(mockFs.unlink).not.toHaveBeenCalledWith('/c/new.mp4');
  expect(handle.state.events.map(e => e.id)).not.toContain(1);

  // Deciding the next sweep against a figure the deletions made stale would
  // keep reclaiming; the sweep re-measures instead.
  expect(mockFs.getFSInfo.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('leaves clips alone when auto-delete is off', async () => {
  await AsyncStorage.setItem('@novaguard:settings', JSON.stringify({ ...defaultSettings, autoDel: false }));
  await AsyncStorage.setItem('@novaguard:events:v2', JSON.stringify([
    { id: 1, kind: 'Animal', timestamp: Date.now(), dur: 5, conf: 90, path: '/c/old.mp4', bytes: 400 * 1024 * 1024 },
  ]));
  reportSpace(1024);

  await mountProvider();
  await ReactTestRenderer.act(async () => {});

  expect(mockFs.unlink).not.toHaveBeenCalled();
});
