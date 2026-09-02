/**
 * The provider used to hand every consumer a new context value on every
 * analysed frame, so the camera, the tab bar and the sheets all re-rendered up
 * to five times a second — including with nothing at all in front of the lens.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppStateProvider, useAppState, useViewfinderState,
} from '../src/state/AppStateContext';
import { FrameDetection } from '../src/ml/types';

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

type State = ReturnType<typeof useAppState>;

function person(x: number, confidence = 0.9): FrameDetection {
  return { kind: 'Personne', confidence, box: { x, y: 0.3, width: 0.2, height: 0.5 } };
}

async function mount() {
  const box: { state?: State; appRenders: number; viewfinderRenders: number } = {
    appRenders: 0,
    viewfinderRenders: 0,
  };

  function AppConsumer() {
    box.state = useAppState();
    box.appRenders++;
    return null;
  }
  function ViewfinderConsumer() {
    useViewfinderState();
    box.viewfinderRenders++;
    return null;
  }

  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(
      <AppStateProvider>
        <AppConsumer />
        <ViewfinderConsumer />
      </AppStateProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {});
  return box;
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

it('does not re-render the main context while the scene stays empty', async () => {
  const box = await mount();
  const before = box.appRenders;

  await ReactTestRenderer.act(async () => {
    for (let i = 0; i < 20; i++) box.state!.reportDetections([], 9 / 16);
  });

  expect(box.appRenders).toBe(before);
});

it('does not re-render the main context while a subject is tracked', async () => {
  const box = await mount();

  // Confirm a subject, then keep reporting it moving across the frame.
  await ReactTestRenderer.act(async () => {
    box.state!.reportDetections([person(0.3)], 9 / 16);
    box.state!.reportDetections([person(0.31)], 9 / 16);
  });
  const before = box.appRenders;

  await ReactTestRenderer.act(async () => {
    for (const x of [0.33, 0.35, 0.37, 0.39, 0.41]) {
      box.state!.reportDetections([person(x)], 9 / 16);
    }
  });

  expect(box.appRenders).toBe(before);
  // The overlay still has to follow the subject.
  expect(box.viewfinderRenders).toBeGreaterThan(1);
});

it('keeps reportDetections stable so the frame processor is not rebuilt', async () => {
  const box = await mount();
  const first = box.state!.reportDetections;

  await ReactTestRenderer.act(async () => {
    box.state!.cyclePost();
    box.state!.setSensitivity('Haute');
  });

  expect(box.state!.reportDetections).toBe(first);
});
