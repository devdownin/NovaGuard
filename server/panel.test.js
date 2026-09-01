import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Panel } from './panel.js';
import { seed } from './seed.js';
import { isTripped, armsIn, isLifeSafety, toggled } from './domain.js';

const sensor = (over) => ({ id: 'x', name: 'X', zone: 'Z', type: 'contact', state: 'closed', battery: 50, ...over });
const panel = (over, opts) => new Panel({ ...seed(), ...over }, { exitDelay: 1, ...opts });
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('domain rules', () => {
  test('a contact sensor rests closed and trips open', () => {
    const s = sensor();
    assert.equal(isTripped(s), false);
    assert.equal(toggled(s).state, 'open');
    assert.equal(isTripped(toggled(s)), true);
  });

  test('motion is ignored in Home mode and live in Away', () => {
    const motion = sensor({ type: 'motion', state: 'clear' });
    assert.equal(armsIn(motion, 'home'), false);
    assert.equal(armsIn(motion, 'away'), true);
  });

  test('contact sensors are live in both modes', () => {
    assert.equal(armsIn(sensor(), 'home'), true);
    assert.equal(armsIn(sensor(), 'away'), true);
  });

  test('smoke and water are life-safety, contacts are not', () => {
    assert.equal(isLifeSafety(sensor({ type: 'smoke' })), true);
    assert.equal(isLifeSafety(sensor({ type: 'water' })), true);
    assert.equal(isLifeSafety(sensor()), false);
  });
});

describe('panel', () => {
  test('arming runs an exit delay and then arms', async () => {
    const p = panel();
    assert.equal(p.setMode('away').status, 'arming');
    assert.equal(p.snapshot.countdown, 1);
    await tick(1300);
    assert.equal(p.snapshot.status, 'armed');
    assert.equal(p.snapshot.events[0].text, 'Armed — Away');
    p.close();
  });

  test('disarming cancels an exit delay in progress', async () => {
    const p = panel();
    p.setMode('away');
    p.setMode('off');
    await tick(1300);
    assert.equal(p.snapshot.status, 'disarmed', 'must not arm after being cancelled');
    p.close();
  });

  test('rejects an unknown mode and an unknown sensor', () => {
    const p = panel();
    assert.throws(() => p.setMode('nope'), (e) => e.status === 400);
    assert.throws(() => p.toggleSensor('nope'), (e) => e.status === 404);
    p.close();
  });

  test('a tripped perimeter sensor breaches an armed panel', async () => {
    const p = panel();
    p.setMode('away');
    await tick(1300);
    p.toggleSensor('s1');
    assert.equal(p.snapshot.status, 'alarm');
    assert.match(p.snapshot.events[0].text, /^Breach — Front Door/);
    p.close();
  });

  test('interior motion does not breach Home mode, but the perimeter does', async () => {
    const p = panel();
    p.setMode('home');
    await tick(1300);

    p.toggleSensor('s4');                       // Living Room motion
    assert.equal(p.snapshot.status, 'armed', 'motion must be ignored in Home');

    p.toggleSensor('s1');                       // Front Door contact
    assert.equal(p.snapshot.status, 'alarm', 'the perimeter stays live in Home');
    p.close();
  });

  test('smoke alarms while the panel is disarmed', () => {
    const p = panel();
    assert.equal(p.snapshot.status, 'disarmed');
    p.toggleSensor('s6');
    assert.equal(p.snapshot.status, 'alarm');
    assert.match(p.snapshot.events[0].text, /^Smoke detected/);
    p.close();
  });

  test('dismissing an alarm disarms', () => {
    const p = panel();
    p.toggleSensor('s6');
    p.dismissAlarm();
    assert.equal(p.snapshot.status, 'disarmed');
    assert.equal(p.snapshot.mode, 'off');
    p.close();
  });

  /* A restart during the exit delay must not leave the house believing it is
     armed when nobody finished leaving. */
  test('an exit delay interrupted by a restart does not complete', () => {
    const p = new Panel({ ...seed(), status: 'arming', mode: 'away', countdown: 12 }, { exitDelay: 1 });
    assert.equal(p.snapshot.status, 'disarmed');
    assert.equal(p.snapshot.mode, 'off');
    assert.match(p.snapshot.events[0].text, /Arming abandoned/);
    p.close();
  });

  test('a persisted armed panel comes back armed', () => {
    const p = new Panel({ ...seed(), status: 'armed', mode: 'away' }, { exitDelay: 1 });
    assert.equal(p.snapshot.status, 'armed');
    p.close();
  });

  test('the snapshot answers armedNow so the client never re-derives it', async () => {
    const p = panel();
    p.setMode('home');
    await tick(1300);
    const by = Object.fromEntries(p.snapshot.sensors.map((s) => [s.id, s.armedNow]));
    assert.equal(by.s4, false, 'interior motion is not live in Home');
    assert.equal(by.s1, true, 'the front door is');
    p.close();
  });

  test('subscribers receive every state change', () => {
    const p = panel();
    const seen = [];
    p.subscribe((s) => seen.push(s.status));
    p.toggleSensor('s6');
    p.dismissAlarm();
    assert.deepEqual(seen, ['alarm', 'disarmed']);
    p.close();
  });
});
