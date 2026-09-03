/**
 * The recording state machine.
 *
 * VisionCamera hands a clip back through a callback rather than a promise, and
 * throws if you stop a recording that never started — so the in-flight state
 * lives in a ref that four different paths read. Every clip-loss bug fixed so
 * far ran through here, and none of it was covered.
 *
 * @format
 */

import React, { useRef } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Camera } from 'react-native-vision-camera';
import * as fs from '@dr.pogodin/react-native-fs';
import { Clip, useRecorder } from '../src/recording/useRecorder';
import { MaxDuration } from '../src/state/types';
import { maxDurationMs } from '../src/recording/library';

const mockFs = fs as jest.Mocked<typeof fs>;

interface Harness {
  recorder: ReturnType<typeof useRecorder>;
  camera: { startRecording: jest.Mock; stopRecording: jest.Mock };
}

/** Captures VisionCamera's two callbacks so a test can fire them itself. */
function fakeCamera() {
  const calls: { onRecordingFinished: Function; onRecordingError: Function }[] = [];
  return {
    calls,
    startRecording: jest.fn(opts => calls.push(opts)),
    stopRecording: jest.fn(),
    last: () => calls[calls.length - 1],
  };
}

async function mount(
  camera: ReturnType<typeof fakeCamera>,
  { enabled = true, max = '1 min' as MaxDuration, onClip = jest.fn(), onError = jest.fn() } = {},
) {
  const box = {} as Harness & { onClip: jest.Mock; onError: jest.Mock; unmount: () => void };
  box.onClip = onClip as jest.Mock;
  box.onError = onError as jest.Mock;

  function Probe({ enabled: on, max: cap }: { enabled: boolean; max: MaxDuration }) {
    const ref = useRef<Camera | null>(camera as unknown as Camera);
    box.recorder = useRecorder({ cameraRef: ref, enabled: on, max: cap, onClip, onError });
    return null;
  }

  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<Probe enabled={enabled} max={max} />);
  });
  // `ensureRecordingsDir` resolves on the next tick; until it does, start() refuses.
  await ReactTestRenderer.act(async () => {});

  box.unmount = () => ReactTestRenderer.act(() => { tree.unmount(); });
  return Object.assign(box, {
    rerender: async (props: { enabled: boolean; max: MaxDuration }) => {
      await ReactTestRenderer.act(async () => { tree.update(<Probe {...props} />); });
    },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFs.exists.mockResolvedValue(true);
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.stat.mockResolvedValue({ size: 4096 } as never);
});

afterEach(() => {
  jest.useRealTimers();
});

it('starts a recording and reports it', async () => {
  const camera = fakeCamera();
  const h = await mount(camera);

  let started!: boolean;
  await ReactTestRenderer.act(async () => { started = h.recorder.start(); });

  expect(started).toBe(true);
  expect(camera.startRecording).toHaveBeenCalledTimes(1);
  expect(camera.startRecording.mock.calls[0][0]).toMatchObject({ fileType: 'mp4', videoCodec: 'h264' });
  expect(h.recorder.isRecording).toBe(true);
});

it('refuses a second start while one is in flight', async () => {
  const camera = fakeCamera();
  const h = await mount(camera);

  let second!: boolean;
  await ReactTestRenderer.act(async () => {
    h.recorder.start();
    second = h.recorder.start();
  });

  // A start() slipping in before the stop callback fires throws inside
  // VisionCamera, so the recorder has to refuse it itself.
  expect(second).toBe(false);
  expect(camera.startRecording).toHaveBeenCalledTimes(1);
});

it('refuses to start when disabled', async () => {
  const camera = fakeCamera();
  const h = await mount(camera, { enabled: false });

  let started!: boolean;
  await ReactTestRenderer.act(async () => { started = h.recorder.start(); });

  expect(started).toBe(false);
  expect(camera.startRecording).not.toHaveBeenCalled();
});

it('hands the finished clip over with its real size read from disk', async () => {
  const camera = fakeCamera();
  const onClip = jest.fn();
  const h = await mount(camera, { onClip });

  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  await ReactTestRenderer.act(async () => {
    camera.last().onRecordingFinished({ path: '/clips/a.mp4', duration: 12.4 });
  });

  // `VideoFile` carries no size, so it comes from stat() once the file closed.
  expect(onClip).toHaveBeenCalledWith<[Clip]>({ path: '/clips/a.mp4', bytes: 4096, duration: 12.4 });
  expect(h.recorder.isRecording).toBe(false);
});

it('stop() returns false when nothing is recording, so the caller closes the session itself', async () => {
  const camera = fakeCamera();
  const h = await mount(camera);

  let stopped!: boolean;
  await ReactTestRenderer.act(async () => { stopped = h.recorder.stop(); });

  expect(stopped).toBe(false);
  expect(camera.stopRecording).not.toHaveBeenCalled();
});

it('keeps the recording marked active until the callback lands', async () => {
  const camera = fakeCamera();
  const h = await mount(camera);

  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  let stopped!: boolean;
  await ReactTestRenderer.act(async () => { stopped = h.recorder.stop(); });

  expect(stopped).toBe(true);
  // Stopping is asynchronous: a start() before the callback would throw.
  await ReactTestRenderer.act(async () => {
    expect(h.recorder.start()).toBe(false);
  });
});

it('cuts the clip at the configured maximum duration', async () => {
  const camera = fakeCamera();
  const h = await mount(camera, { max: '1 min' });

  await ReactTestRenderer.act(async () => { h.recorder.start(); });

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(maxDurationMs('1 min') - 1); });
  expect(camera.stopRecording).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(1); });
  expect(camera.stopRecording).toHaveBeenCalledTimes(1);
});

it('drops the duration cap once the clip has landed, so it cannot cut the next one short', async () => {
  const cap = maxDurationMs('1 min');
  const camera = fakeCamera();
  const h = await mount(camera, { max: '1 min' });

  // First clip runs briefly and ends well before its cap would fire.
  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(1_000); });
  await ReactTestRenderer.act(async () => {
    camera.last().onRecordingFinished({ path: '/clips/a.mp4', duration: 1 });
  });

  // A long second passage opens. Asserting only "the cap did not fire after the
  // clip landed" would pass even with the timer left running, because `stop()`
  // no-ops when nothing is active — the stale timer only does damage once
  // something IS active again.
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(1_000); });
  await ReactTestRenderer.act(async () => { h.recorder.start(); });

  // Past the first recording's deadline, still short of the second's.
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(cap - 1_500); });
  expect(camera.stopRecording).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(2_000); });
  expect(camera.stopRecording).toHaveBeenCalledTimes(1);
});

it('surfaces an encoder error and clears the in-flight state', async () => {
  const camera = fakeCamera();
  const onError = jest.fn();
  const h = await mount(camera, { onError });

  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  await ReactTestRenderer.act(async () => {
    camera.last().onRecordingError({ message: 'no space left' });
  });

  expect(onError).toHaveBeenCalledWith('no space left');
  expect(h.recorder.isRecording).toBe(false);
  // The failure must leave the recorder able to try again.
  await ReactTestRenderer.act(async () => { expect(h.recorder.start()).toBe(true); });
});

it('surfaces a throwing startRecording instead of pretending to record', async () => {
  const camera = fakeCamera();
  camera.startRecording.mockImplementation(() => { throw new Error('camera busy'); });
  const onError = jest.fn();
  const h = await mount(camera, { onError });

  let started!: boolean;
  await ReactTestRenderer.act(async () => { started = h.recorder.start(); });

  expect(started).toBe(false);
  expect(onError).toHaveBeenCalledWith('camera busy');
  expect(h.recorder.isRecording).toBe(false);
});

it('stops the encoder when recording is disabled mid-clip', async () => {
  const camera = fakeCamera();
  const h = await mount(camera, { enabled: true });

  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  await h.rerender({ enabled: false, max: '1 min' });

  // Monitoring off must not leave the encoder writing a file nothing will claim.
  expect(camera.stopRecording).toHaveBeenCalledTimes(1);
});

it('stops the encoder on unmount', async () => {
  const camera = fakeCamera();
  const h = await mount(camera);

  await ReactTestRenderer.act(async () => { h.recorder.start(); });
  h.unmount();

  expect(camera.stopRecording).toHaveBeenCalledTimes(1);
});

it('reports an unusable recordings directory rather than failing silently', async () => {
  mockFs.exists.mockResolvedValue(false);
  mockFs.mkdir.mockRejectedValue(new Error('EACCES'));
  const camera = fakeCamera();
  const onError = jest.fn();
  const h = await mount(camera, { onError });

  expect(onError).toHaveBeenCalledWith("Dossier d'enregistrement inaccessible");
  // And it must not pretend it can record.
  await ReactTestRenderer.act(async () => { expect(h.recorder.start()).toBe(false); });
});
