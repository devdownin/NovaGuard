import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load, save } from './persist.js';
import { seed } from './seed.js';

const dir = () => mkdtemp(join(tmpdir(), 'sentinelle-'));

describe('persistence', () => {
  test('a saved panel loads back unchanged', async () => {
    const file = join(await dir(), 'state.json');
    const state = { ...seed(), status: 'armed', mode: 'away' };
    await save(file, state);
    assert.deepEqual(await load(file), state);
  });

  test('a missing file is not an error — the panel boots from seed', async () => {
    assert.equal(await load(join(await dir(), 'nothing.json')), null);
  });

  /* A security system that refuses to start because its state file is
     damaged is worse than one that starts fresh. */
  test('a corrupt file falls back to seed instead of throwing', async () => {
    const file = join(await dir(), 'state.json');
    await writeFile(file, '{ this is not json');
    assert.equal(await load(file), null);
  });

  test('saving creates the directory and leaves no temp file behind', async () => {
    const base = await dir();
    const file = join(base, 'nested', 'state.json');
    await save(file, seed());
    const left = await readdir(join(base, 'nested'));
    assert.deepEqual(left, ['state.json']);
  });
});
