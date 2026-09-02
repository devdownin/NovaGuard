import {
  DocumentDirectoryPath, exists, getFSInfo, mkdir, moveFile, readDir, stat, unlink,
} from '@dr.pogodin/react-native-fs';
import { StorageInfo } from '../state/types';

/**
 * Every filesystem effect the recording feature needs, in one place.
 *
 * Clips live in the app's private documents directory: no storage permission
 * is required, the OS removes them when the app is uninstalled, and nothing
 * lands in the shared gallery — which is what "traitement 100 % local" has to
 * mean for footage of whoever walks past the camera.
 */
export const RECORDINGS_DIR = `${DocumentDirectoryPath}/recordings`;

export async function ensureRecordingsDir(): Promise<void> {
  if (await exists(RECORDINGS_DIR)) return;
  await mkdir(RECORDINGS_DIR);
}

export async function fileSize(path: string): Promise<number> {
  try {
    const info = await stat(path);
    // `size` comes back as a number on Android and a string on some platforms.
    return Number(info.size) || 0;
  } catch {
    return 0;
  }
}

/**
 * Renames a finished clip in place, returning the path it now lives at.
 *
 * Falls back to the original path on any failure: a recording that exists under
 * an unhelpful name is worth far more than one lost to a rename. Refuses to
 * clobber an existing file, which two events landing in the same second would
 * otherwise do.
 */
export async function renameRecording(from: string, filename: string): Promise<string> {
  try {
    // Walk suffixes until one is free. The previous `_${Date.now() % 1000}`
    // suffix was itself collision-prone: two clips renamed in the same
    // millisecond produced the same name, and `moveFile` overwrites — so the
    // first clip was destroyed while its event went on pointing at the path.
    const target = await freeName(from, filename);
    if (target === from) return from;
    await moveFile(from, target);
    return target;
  } catch {
    return from;
  }
}

/** First unused path for `filename`, or `from` if the clip is already there. */
async function freeName(from: string, filename: string): Promise<string> {
  const base = filename.replace(/\.mp4$/, '');
  for (let n = 0; n < 100; n++) {
    const candidate = `${RECORDINGS_DIR}/${n === 0 ? base : `${base}_${n}`}.mp4`;
    if (candidate === from) return from;
    if (!(await exists(candidate))) return candidate;
  }
  return `${RECORDINGS_DIR}/${base}_${Date.now()}.mp4`;
}

export async function deleteFile(path: string | null): Promise<void> {
  if (!path) return;
  try {
    if (await exists(path)) await unlink(path);
  } catch {
    // A clip that is already gone is the state we wanted anyway.
  }
}

/**
 * Bound on concurrent unlinks. `Promise.all` over the raw list issued one
 * `exists` + `unlink` pair per clip at once — "tout supprimer" on a long
 * history fired thousands of native calls in one tick, which stalls the JS
 * thread and can exhaust the FS module's thread pool mid-wipe.
 */
const DELETE_CONCURRENCY = 8;

export async function deleteFiles(paths: (string | null)[]): Promise<void> {
  const queue = paths.filter((p): p is string => !!p);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) await deleteFile(queue[cursor++]);
  };
  await Promise.all(
    Array.from({ length: Math.min(DELETE_CONCURRENCY, queue.length) }, worker),
  );
}

/** Absolute paths of every clip currently on disk. */
export async function listRecordings(): Promise<string[]> {
  try {
    if (!(await exists(RECORDINGS_DIR))) return [];
    const items = await readDir(RECORDINGS_DIR);
    return items.filter(i => i.isFile()).map(i => i.path);
  } catch {
    return [];
  }
}

/**
 * Clips on disk that no event points to any more — the result of a crash
 * between `onRecordingFinished` and the state write, or of an event deleted
 * while its file was still being written. Without this the directory would
 * grow in a way nothing in the UI could ever account for.
 */
export async function orphanedRecordings(knownPaths: (string | null)[]): Promise<string[]> {
  const known = new Set(knownPaths.filter((p): p is string => !!p));
  const onDisk = await listRecordings();
  return onDisk.filter(p => !known.has(p));
}

export async function storageInfo(usedByEvents: number): Promise<StorageInfo> {
  try {
    const info = await getFSInfo();
    return {
      used: usedByEvents,
      free: Number(info.freeSpace) || 0,
      total: Number(info.totalSpace) || 0,
    };
  } catch {
    return { used: usedByEvents, free: 0, total: 0 };
  }
}
