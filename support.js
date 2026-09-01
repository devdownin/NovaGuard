/* ===========================================================================
   support.js — formatters, a small store, and the panel API client.

   The domain rules that used to live here now live on the server: the panel
   decides, this client displays.
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

  /* --- panel API ------------------------------------------------------ */

  function request(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (payload) {
        if (!res.ok) throw new Error(payload.error || res.statusText || 'request failed');
        return payload;
      });
    });
  }

  var api = {
    state: function () {
      return request('GET', '/api/state');
    },
    setMode: function (mode) {
      return request('POST', '/api/mode', { mode: mode });
    },
    toggleSensor: function (id) {
      return request('POST', '/api/sensors/' + encodeURIComponent(id) + '/toggle');
    },
    dismissAlarm: function () {
      return request('POST', '/api/alarm/dismiss');
    },
    callHelp: function () {
      return request('POST', '/api/alarm/call-help');
    },

    /**
     * Subscribe to panel state. EventSource reconnects on its own; onLink
     * reports whether what is on screen is currently live.
     *
     * A security display that goes stale without saying so is worse than one
     * that admits it, so connection state is part of the UI.
     */
    stream: function (onState, onLink) {
      var source = new EventSource('/api/stream');
      source.addEventListener('open', function () { onLink(true); });
      source.addEventListener('error', function () { onLink(false); });
      source.addEventListener('message', function (e) {
        onLink(true);
        onState(JSON.parse(e.data));
      });
      return function () { source.close(); };
    }
  };

  global.Support = {
    clockTime: clockTime,
    relativeTime: relativeTime,
    createStore: createStore,
    api: api
  };
})(window);
