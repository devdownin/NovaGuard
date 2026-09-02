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
  const to = `${RECORDINGS_DIR}/${filename}`;
  if (to === from) return from;
  try {
    if (await exists(to)) {
      const unique = filename.replace(/\.mp4$/, `_${Date.now() % 1000}.mp4`);
      await moveFile(from, `${RECORDINGS_DIR}/${unique}`);
      return `${RECORDINGS_DIR}/${unique}`;
    }
    await moveFile(from, to);
    return to;
  } catch {
    return from;
  }
}

export async function deleteFile(path: string | null): Promise<void> {
  if (!path) return;
  try {
    if (await exists(path)) await unlink(path);
  } catch {
    // A clip that is already gone is the state we wanted anyway.
  }
}

export async function deleteFiles(paths: (string | null)[]): Promise<void> {
  await Promise.all(paths.map(deleteFile));
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
