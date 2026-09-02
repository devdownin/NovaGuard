/**
 * Renaming a finished clip.
 *
 * This runs after the encoder has closed a file that already exists on disk, so
 * every failure mode here loses a real recording. The rules are: never throw,
 * never clobber, and if anything goes wrong keep the clip under whatever name
 * it already has.
 *
 * @format
 */

import * as fs from '@dr.pogodin/react-native-fs';
import { deleteFiles, RECORDINGS_DIR, renameRecording } from '../src/recording/videoStore';

const mockFs = fs as jest.Mocked<typeof fs>;
const ORIGINAL = `${RECORDINGS_DIR}/6F2A1C9E-cam.mp4`;

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.exists.mockResolvedValue(false);
  mockFs.moveFile.mockResolvedValue(undefined);
});

it('moves the clip to the event-derived name', async () => {
  const path = await renameRecording(ORIGINAL, 'Personne_2026-09-02_14-32-07.mp4');
  expect(path).toBe(`${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07.mp4`);
  expect(mockFs.moveFile).toHaveBeenCalledWith(ORIGINAL, path);
});

it('does nothing when the clip is already correctly named', async () => {
  const already = `${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07.mp4`;
  await expect(renameRecording(already, 'Personne_2026-09-02_14-32-07.mp4')).resolves.toBe(already);
  expect(mockFs.moveFile).not.toHaveBeenCalled();
});

it('never overwrites an existing clip', async () => {
  // Two events can land in the same second — a passage cut by the duration cap
  // and immediately reopened, for one.
  mockFs.exists.mockResolvedValue(true);
  const path = await renameRecording(ORIGINAL, 'Personne_2026-09-02_14-32-07.mp4');
  expect(path).not.toBe(`${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07.mp4`);
  expect(path).toMatch(/Personne_2026-09-02_14-32-07_\d+\.mp4$/);
  expect(mockFs.moveFile).toHaveBeenCalledWith(ORIGINAL, path);
});

it('keeps the recording under its original name if the move fails', async () => {
  mockFs.moveFile.mockRejectedValue(new Error('EXDEV'));
  await expect(renameRecording(ORIGINAL, 'Personne_2026-09-02_14-32-07.mp4'))
    .resolves.toBe(ORIGINAL);
});

it('survives a filesystem that cannot even answer whether the name is taken', async () => {
  mockFs.exists.mockRejectedValue(new Error('EIO'));
  await expect(renameRecording(ORIGINAL, 'Personne_2026-09-02_14-32-07.mp4'))
    .resolves.toBe(ORIGINAL);
});

describe('name collisions', () => {
  // The old `_${Date.now() % 1000}` suffix collided with itself, and `moveFile`
  // overwrites: the first clip was destroyed while its event kept pointing at
  // the path it used to occupy.
  it('walks past every name already taken', async () => {
    const taken = new Set([
      `${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07.mp4`,
      `${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07_1.mp4`,
    ]);
    mockFs.exists.mockImplementation(async (p: string) => taken.has(p));

    const path = await renameRecording(ORIGINAL, 'Personne_2026-09-02_14-32-07.mp4');

    expect(path).toBe(`${RECORDINGS_DIR}/Personne_2026-09-02_14-32-07_2.mp4`);
    expect(mockFs.moveFile).toHaveBeenCalledWith(ORIGINAL, path);
  });

  it('never asks moveFile to overwrite an existing clip', async () => {
    mockFs.exists.mockImplementation(async (p: string) =>
      p === `${RECORDINGS_DIR}/Animal_2026-09-02_10-00-00.mp4`);

    const path = await renameRecording(ORIGINAL, 'Animal_2026-09-02_10-00-00.mp4');

    expect(path).not.toBe(`${RECORDINGS_DIR}/Animal_2026-09-02_10-00-00.mp4`);
    expect(mockFs.moveFile).toHaveBeenCalledWith(ORIGINAL, path);
  });
});

describe('deleteFiles', () => {
  it('unlinks every clip, skipping the ones with no file', async () => {
    mockFs.exists.mockResolvedValue(true);
    const paths = Array.from({ length: 40 }, (_, i) => `${RECORDINGS_DIR}/bulk-${i}.mp4`);

    await deleteFiles([...paths, null]);

    expect(mockFs.unlink).toHaveBeenCalledTimes(paths.length);
    for (const p of paths) expect(mockFs.unlink).toHaveBeenCalledWith(p);
  });

  it('never has more than DELETE_CONCURRENCY unlinks in flight', async () => {
    mockFs.exists.mockResolvedValue(true);
    let inFlight = 0;
    let peak = 0;
    mockFs.unlink.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>(resolve => setImmediate(() => resolve()));
      inFlight--;
    });

    await deleteFiles(Array.from({ length: 200 }, (_, i) => `${RECORDINGS_DIR}/x-${i}.mp4`));

    expect(peak).toBeLessThanOrEqual(8);
    expect(mockFs.unlink).toHaveBeenCalledTimes(200);
  });
});
