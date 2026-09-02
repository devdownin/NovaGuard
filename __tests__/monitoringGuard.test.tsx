/**
 * Starting surveillance is gated on the camera permission.
 *
 * Without the gate this took the whole app down on a real device: the
 * foreground service claims the `camera` type, Android requires the permission
 * to be held at that instant, and the SecurityException is raised inside the
 * service — a stack no caller can wrap in a try/catch.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useCameraPermission } from 'react-native-vision-camera';
import { AppStateProvider, useAppState } from '../src/state/AppStateContext';
import { startForegroundService } from '../src/surveillance/foregroundService';

jest.mock('../src/surveillance/foregroundService', () => ({
  ...jest.requireActual('../src/surveillance/foregroundService'),
  startForegroundService: jest.fn(() => true),
  stopForegroundService: jest.fn(),
  dismissDetectionAlert: jest.fn(),
  notifyDetection: jest.fn(),
  foregroundServiceError: jest.fn(() => null),
  hasNotificationPermission: jest.fn(async () => false),
  requestNotificationPermission: jest.fn(async () => false),
  openDetectionChannelSettings: jest.fn(),
}));

const permission = useCameraPermission as jest.Mock;
const startService = startForegroundService as jest.Mock;

type State = ReturnType<typeof useAppState>;

async function mount() {
  const box: { state?: State } = {};
  function Probe() {
    box.state = useAppState();
    return null;
  }
  // Hydration and the first storage measurement are async; letting them settle
  // inside act keeps their state updates from landing outside one.
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<AppStateProvider><Probe /></AppStateProvider>);
  });
  await ReactTestRenderer.act(async () => {});
  return box;
}

const requestPermission = jest.fn();

beforeEach(() => {
  // The provider runs a 1 s clock; on real timers it fires throughout the test
  // and buries the output in act() warnings.
  jest.useFakeTimers();
  jest.clearAllMocks();
  permission.mockReturnValue({ hasPermission: false, requestPermission });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

it('refuses to start without the camera permission, and asks for it', async () => {
  const box = await mount();
  ReactTestRenderer.act(() => { box.state!.toggleMonitoring(); });

  expect(box.state!.monitoring).toBe(false);
  expect(requestPermission).toHaveBeenCalled();
  expect(startService).not.toHaveBeenCalled();
  expect(box.state!.recError).toBe('Autorisez la caméra pour démarrer la surveillance');
});

it('starts once the permission is held', async () => {
  permission.mockReturnValue({ hasPermission: true, requestPermission });
  const box = await mount();
  ReactTestRenderer.act(() => { box.state!.toggleMonitoring(); });

  expect(box.state!.monitoring).toBe(true);
  expect(box.state!.recError).toBeNull();
  expect(startService).toHaveBeenCalled();
});

it('stops again without needing any permission', async () => {
  permission.mockReturnValue({ hasPermission: true, requestPermission });
  const box = await mount();
  ReactTestRenderer.act(() => { box.state!.toggleMonitoring(); });
  ReactTestRenderer.act(() => { box.state!.toggleMonitoring(); });

  expect(box.state!.monitoring).toBe(false);
});
