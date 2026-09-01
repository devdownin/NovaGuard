/* ===========================================================================
   The alarm panel: authoritative state plus the transitions between them.

   Everything that decides something lives here. The client sends commands and
   renders whatever comes back.
   =========================================================================== */

import { MODES, isTripped, armsIn, isLifeSafety, toggled } from './domain.js';

let seq = 0;
function makeEvent(kind, text) {
  seq += 1;
  return { id: `ev${seq}-${Date.now().toString(36)}`, kind, text, at: Date.now() };
}

const MAX_EVENTS = 200;

export class Panel {
  #state;
  #exitDelay;
  #timer = null;
  #listeners = new Set();

  constructor(initial, { exitDelay = 30 } = {}) {
    this.#exitDelay = exitDelay;
    this.#state = { ...initial, countdown: 0 };

    /* An exit delay interrupted by a restart must never silently complete —
       the house would report itself armed without anyone having left. */
    if (this.#state.status === 'arming') {
      this.#state.status = 'disarmed';
      this.#state.mode = 'off';
      this.#state.events = [
        makeEvent('system', 'Arming abandoned — panel restarted'),
        ...this.#state.events
      ];
    }
  }

  get exitDelay() { return this.#exitDelay; }

  /** Client-facing shape: the client never recomputes a decision. */
  get snapshot() {
    const s = this.#state;
    return {
      property: s.property,
      mode: s.mode,
      status: s.status,
      countdown: s.countdown,
      exitDelay: this.#exitDelay,
      sensors: s.sensors.map((x) => ({
        ...x,
        tripped: isTripped(x),
        /* Whether this sensor is live right now, so the client can say
           "ignored in Home" without knowing the rule. */
        armedNow: s.status === 'armed' ? armsIn(x, s.mode) : null
      })),
      cameras: s.cameras,
      events: s.events
    };
  }

  /** Raw state, for persistence. */
  get persisted() {
    const { property, mode, status, sensors, cameras, events } = this.#state;
    return { property, mode, status, countdown: 0, sensors, cameras, events };
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    const snap = this.snapshot;
    for (const fn of this.#listeners) fn(snap);
  }

  #log(kind, text) {
    this.#state.events = [makeEvent(kind, text), ...this.#state.events].slice(0, MAX_EVENTS);
  }

  #stopTimer() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /* --- commands ------------------------------------------------------- */

  setMode(mode) {
    if (!MODES.includes(mode)) {
      throw Object.assign(new Error(`unknown mode: ${mode}`), { status: 400 });
    }
    this.#stopTimer();

    if (mode === 'off') {
      this.#state.mode = 'off';
      this.#state.status = 'disarmed';
      this.#state.countdown = 0;
      this.#log('system', 'System disarmed');
      this.#emit();
      return this.snapshot;
    }

    this.#state.mode = mode;
    this.#state.status = 'arming';
    this.#state.countdown = this.#exitDelay;
    this.#emit();

    this.#timer = setInterval(() => {
      this.#state.countdown -= 1;
      if (this.#state.countdown > 0) {
        this.#emit();
        return;
      }
      this.#stopTimer();
      this.#state.status = 'armed';
      this.#state.countdown = 0;
      this.#log('system', `Armed — ${mode === 'away' ? 'Away' : 'Home'}`);
      this.#emit();
    }, 1000);

    return this.snapshot;
  }

  toggleSensor(id) {
    const index = this.#state.sensors.findIndex((x) => x.id === id);
    if (index === -1) {
      throw Object.assign(new Error(`unknown sensor: ${id}`), { status: 404 });
    }

    const next = toggled(this.#state.sensors[index]);
    this.#state.sensors = this.#state.sensors.map((x, i) => (i === index ? next : x));

    if (isTripped(next)) {
      if (isLifeSafety(next)) {
        this.#raise('alarm', `${next.type === 'smoke' ? 'Smoke' : 'Water'} detected — ${next.name}`);
      } else if (this.#state.status === 'armed' && armsIn(next, this.#state.mode)) {
        this.#raise('alarm', `Breach — ${next.name} (${next.zone})`);
      } else {
        this.#log(next.type === 'motion' ? 'motion' : 'system', `${next.name} ${next.state}`);
      }
    }

    this.#emit();
    return this.snapshot;
  }

  #raise(kind, text) {
    this.#stopTimer();
    this.#state.status = 'alarm';
    this.#state.countdown = 0;
    this.#log(kind, text);
  }

  dismissAlarm() {
    this.#stopTimer();
    this.#state.status = 'disarmed';
    this.#state.mode = 'off';
    this.#state.countdown = 0;
    this.#log('system', 'Alarm dismissed — system disarmed');
    this.#emit();
    return this.snapshot;
  }

  callHelp() {
    this.#log('system', 'Emergency contacts called');
    this.#emit();
    return this.snapshot;
  }

  /** Replace all state. Test-only; see server/index.js. */
  reset(state) {
    this.#stopTimer();
    this.#state = { ...state, countdown: 0 };
    this.#emit();
    return this.snapshot;
  }

  close() { this.#stopTimer(); }
}
