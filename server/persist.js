/* ===========================================================================
   State persistence: a single JSON file, written atomically.

   Writes go to a temp file and are renamed into place, so a crash mid-write
   cannot leave a half-written file that fails to parse at next boot.
   =========================================================================== */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function load(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    /* A corrupt file should not stop the panel from booting — a security
       system that refuses to start is worse than one that starts fresh. */
    if (err instanceof SyntaxError) {
      process.emitWarning(`state file ${file} is not valid JSON; starting from seed`);
      return null;
    }
    throw err;
  }
}

export async function save(file, state) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, file);
}

/**
 * Persist on change, but never while an exit delay is counting down: that
 * would rewrite the file once a second to record a number that is deliberately
 * not restored across a restart.
 */
export function persistOnChange(panel, file) {
  let pending = null;
  return panel.subscribe((snap) => {
    if (snap.status === 'arming') return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      save(file, panel.persisted).catch((err) => {
        process.emitWarning(`could not persist state: ${err.message}`);
      });
    }, 50);
    pending.unref?.();
  });
}
