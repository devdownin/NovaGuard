/* ===========================================================================
   support.js — state store, formatters and seed data for Sentinelle.
   Exposes: window.Support
   =========================================================================== */
(function (global) {
  'use strict';

  /* --- time helpers -------------------------------------------------- */

  function clockTime(d) {
    d = d || new Date();
    var h = d.getHours() % 12 || 12;
    return h + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** "now", "4m ago", "2h ago", "Tue 21:40" */
  function relativeTime(ts, now) {
    var secs = Math.round(((now || Date.now()) - ts) / 1000);
    if (secs < 45) return 'now';
    if (secs < 3600) return Math.round(secs / 60) + 'm ago';
    if (secs < 86400) return Math.round(secs / 3600) + 'h ago';
    var d = new Date(ts);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* --- tiny observable store ----------------------------------------- */

  function createStore(initial) {
    var state = initial;
    var subs = [];
    return {
      get: function () { return state; },
      set: function (patch) {
        state = Object.assign({}, state, typeof patch === 'function' ? patch(state) : patch);
        subs.forEach(function (fn) { fn(state); });
      },
      subscribe: function (fn) {
        subs.push(fn);
        return function () { subs = subs.filter(function (s) { return s !== fn; }); };
      }
    };
  }

  /* --- domain model ---------------------------------------------------

     A sensor is "tripped" when its state is not its resting state. Contact
     sensors rest closed, motion sensors rest clear, environmental sensors
     rest clear. Tripping a perimeter sensor while the system is armed is
     what raises the alarm.
     -------------------------------------------------------------------- */

  var RESTING = { contact: 'closed', motion: 'clear', smoke: 'clear', water: 'clear' };
  var TRIPPED = { contact: 'open', motion: 'motion', smoke: 'smoke', water: 'leak' };

  function isTripped(sensor) { return sensor.state !== RESTING[sensor.type]; }

  /** Motion sensors are ignored in Home mode — that is the point of Home mode. */
  function armsIn(sensor, mode) {
    if (sensor.type === 'motion') return mode === 'away';
    return true;
  }

  var MINUTE = 60000;
  var t0 = Date.now();

  function seed() {
    return {
      property: 'Rue Lafayette',
      mode: 'off',            // 'off' | 'home' | 'away'
      status: 'disarmed',     // 'disarmed' | 'arming' | 'armed' | 'alarm'
      countdown: 0,
      tab: 'home',
      sensors: [
        { id: 's1', name: 'Front Door',    zone: 'Entry',    type: 'contact', state: 'closed', battery: 92 },
        { id: 's2', name: 'Garage Door',   zone: 'Perimeter',type: 'contact', state: 'closed', battery: 74 },
        { id: 's3', name: 'Back Window',   zone: 'Perimeter',type: 'contact', state: 'closed', battery: 12 },
        { id: 's4', name: 'Living Room',   zone: 'Interior', type: 'motion',  state: 'clear',  battery: 88 },
        { id: 's5', name: 'Hallway',       zone: 'Interior', type: 'motion',  state: 'clear',  battery: 61 },
        { id: 's6', name: 'Kitchen Smoke', zone: 'Safety',   type: 'smoke',   state: 'clear',  battery: 97 }
      ],
      cameras: [
        { id: 'c1', name: 'Front Porch', status: 'live',    lastMotion: t0 - 6 * MINUTE },
        { id: 'c2', name: 'Driveway',    status: 'live',    lastMotion: t0 - 41 * MINUTE },
        { id: 'c3', name: 'Back Garden', status: 'live',    lastMotion: t0 - 3 * 60 * MINUTE },
        { id: 'c4', name: 'Garage',      status: 'offline', lastMotion: t0 - 26 * 60 * MINUTE }
      ],
      events: [
        { id: 'e1', kind: 'motion',  text: 'Motion on Front Porch',        at: t0 - 6 * MINUTE },
        { id: 'e2', kind: 'system',  text: 'System disarmed by Chloé',     at: t0 - 52 * MINUTE },
        { id: 'e3', kind: 'battery', text: 'Back Window battery low (12%)',at: t0 - 4 * 60 * MINUTE },
        { id: 'e4', kind: 'system',  text: 'Armed — Away',                 at: t0 - 9 * 60 * MINUTE },
        { id: 'e5', kind: 'motion',  text: 'Motion on Driveway',           at: t0 - 11 * 60 * MINUTE }
      ]
    };
  }

  var eventSeq = 0;
  function makeEvent(kind, text) {
    return { id: 'ev' + (++eventSeq), kind: kind, text: text, at: Date.now() };
  }

  global.Support = {
    clockTime: clockTime,
    relativeTime: relativeTime,
    createStore: createStore,
    seed: seed,
    makeEvent: makeEvent,
    isTripped: isTripped,
    armsIn: armsIn,
    RESTING: RESTING,
    TRIPPED: TRIPPED,
    EXIT_DELAY: 10
  };
})(window);
