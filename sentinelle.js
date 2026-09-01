/* ===========================================================================
   sentinelle.js — the Sentinelle screen.
   =========================================================================== */
(function (global) {
  'use strict';

  var N = global.Nocturne;
  var S = global.Support;
  var el = N.el, icon = N.icon;

  var store = S.createStore(S.seed());
  var unseen = 0;
  var armTimer = null;

  /* =========================================================================
     Actions
     ====================================================================== */

  function log(kind, text) {
    store.set(function (s) {
      if (s.tab !== 'events') unseen++;
      return { events: [S.makeEvent(kind, text)].concat(s.events) };
    });
  }

  function stopArming() {
    if (armTimer) { clearInterval(armTimer); armTimer = null; }
  }

  function setMode(mode) {
    var s = store.get();
    if (mode === s.mode && s.status !== 'arming') return;

    stopArming();

    if (mode === 'off') {
      store.set({ mode: 'off', status: 'disarmed', countdown: 0 });
      log('system', 'System disarmed');
      return;
    }

    store.set({ mode: mode, status: 'arming', countdown: S.EXIT_DELAY });
    armTimer = setInterval(function () {
      var next = store.get().countdown - 1;
      if (next > 0) { store.set({ countdown: next }); return; }
      stopArming();
      store.set({ status: 'armed', countdown: 0 });
      log('system', 'Armed — ' + (mode === 'away' ? 'Away' : 'Home'));
    }, 1000);
  }

  function dismissAlarm() {
    stopArming();
    store.set({ status: 'disarmed', mode: 'off', countdown: 0 });
    log('system', 'Alarm dismissed — system disarmed');
  }

  /**
   * Tapping a sensor simulates it changing state. If the system is armed and
   * the sensor participates in the current mode, that is a breach.
   */
  function toggleSensor(id) {
    var s = store.get();
    var hit = null;

    var sensors = s.sensors.map(function (x) {
      if (x.id !== id) return x;
      hit = Object.assign({}, x, {
        state: S.isTripped(x) ? S.RESTING[x.type] : S.TRIPPED[x.type]
      });
      return hit;
    });
    store.set({ sensors: sensors });
    if (!hit) return;

    var tripped = S.isTripped(hit);

    /* Smoke is a life-safety sensor: it alarms whether or not we are armed. */
    if (tripped && hit.type === 'smoke') {
      stopArming();
      store.set({ status: 'alarm', countdown: 0 });
      log('alarm', 'Smoke detected — ' + hit.name);
      return;
    }

    if (tripped && s.status === 'armed' && S.armsIn(hit, s.mode)) {
      stopArming();
      store.set({ status: 'alarm', countdown: 0 });
      log('alarm', 'Breach — ' + hit.name + ' (' + hit.zone + ')');
    } else if (tripped) {
      log(hit.type === 'motion' ? 'motion' : 'system', hit.name + ' ' + S.TRIPPED[hit.type]);
    }
  }

  function setTab(tab) {
    if (tab === 'events') unseen = 0;
    store.set({ tab: tab });
  }

  /* =========================================================================
     View helpers
     ====================================================================== */

  var SENSOR_ICON = { contact: 'door', motion: 'motion', smoke: 'smoke', water: 'window' };

  var HERO = {
    disarmed: { icon: 'off',    label: 'Disarmed',   badge: null },
    arming:   { icon: 'clock',  label: 'Arming…',    badge: null },
    armed:    { icon: 'check',  label: 'Armed',      badge: null },
    alarm:    { icon: 'bell',   label: 'Alarm',      badge: null }
  };

  function heroSub(s) {
    if (s.status === 'alarm')  return 'Siren active · Contacts alerted';
    if (s.status === 'arming') return 'Leave now — exit delay running';
    if (s.status === 'armed')  return s.mode === 'away'
      ? 'All zones active'
      : 'Perimeter active · interior ignored';
    var open = s.sensors.filter(S.isTripped).length;
    return open ? open + ' sensor' + (open > 1 ? 's' : '') + ' need attention' : 'All sensors resting';
  }

  function renderHero(s) {
    var cfg = HERO[s.status];

    var text = [
      el('p', { class: 'sn-hero__label', text: cfg.label }),
      el('p', { class: 'sn-hero__sub', text: heroSub(s) })
    ];

    if (s.status === 'arming') {
      text.push(el('p', { class: 'sn-hero__count', text: s.countdown + 's' }));
    }

    var kids = [
      el('div', { class: 'sn-hero__row' }, [
        el('div', { class: 'sn-hero__badge', html: icon(cfg.icon, { size: 27, stroke: 1.8 }) }),
        el('div', {}, text)
      ])
    ];

    if (s.status === 'alarm') {
      kids.push(el('div', { class: 'sn-hero__actions' }, [
        el('button', { class: 'n-btn n-btn--danger', text: 'Dismiss', onclick: dismissAlarm }),
        el('button', {
          class: 'n-btn n-btn--ghost', text: 'Call help',
          onclick: function () { log('system', 'Emergency contacts called'); }
        })
      ]));
    } else if (s.status === 'arming') {
      kids.push(el('div', { class: 'sn-hero__actions' }, [
        el('button', {
          class: 'n-btn n-btn--ghost', text: 'Cancel',
          onclick: function () { setMode('off'); }
        })
      ]));
    }

    return el('div', { class: 'sn-hero sn-hero--' + s.status }, kids);
  }

  var MODES = [
    { id: 'off',  label: 'Disarmed', icon: 'off' },
    { id: 'home', label: 'Home',     icon: 'home' },
    { id: 'away', label: 'Away',     icon: 'away' }
  ];

  function renderModes(s) {
    return el('div', { class: 'sn-modes', role: 'group', 'aria-label': 'Arm mode' },
      MODES.map(function (m) {
        return el('button', {
          class: 'sn-mode',
          type: 'button',
          'aria-pressed': String(s.mode === m.id),
          onclick: function () { setMode(m.id); }
        }, [
          el('span', { html: icon(m.icon, { size: 21 }) }),
          el('span', { text: m.label })
        ]);
      })
    );
  }

  function renderSensorRow(sensor, s) {
    var tripped = S.isTripped(sensor);
    var breach = tripped && s.status === 'alarm' && S.armsIn(sensor, s.mode);
    var ignored = s.status === 'armed' && !S.armsIn(sensor, s.mode);

    var cls = 'sn-row' + (breach ? ' sn-row--breach' : tripped ? ' sn-row--tripped' : '');

    var meta = [
      el('span', { text: sensor.zone }),
      el('span', { text: '·' }),
      el('span', {
        class: sensor.battery <= 20 ? 'sn-row__bat--low' : '',
        text: sensor.battery + '%'
      })
    ];
    if (ignored) {
      meta.push(el('span', { text: '·' }));
      meta.push(el('span', { text: 'ignored in Home' }));
    }

    return el('button', {
      class: cls + (ignored ? ' sn-row__muted' : ''),
      type: 'button',
      onclick: function () { toggleSensor(sensor.id); }
    }, [
      el('span', { class: 'sn-row__icon', html: icon(SENSOR_ICON[sensor.type], { size: 19 }) }),
      el('span', { class: 'sn-row__main' }, [
        el('span', { class: 'sn-row__name', text: sensor.name }),
        el('span', { class: 'sn-row__meta' }, meta)
      ]),
      el('span', {
        class: 'n-chip' + (breach ? ' n-chip--danger' : tripped ? ' n-chip--warn' : ''),
        text: sensor.state
      })
    ]);
  }

  function section(title, action, body) {
    var head = [el('h2', { class: 'n-section__title', text: title })];
    if (action) {
      head.push(el('button', {
        class: 'n-section__action', type: 'button',
        text: action.label, onclick: action.onClick
      }));
    }
    return el('section', { class: 'n-section' }, [
      el('div', { class: 'n-section__head' }, head),
      body
    ]);
  }

  var EVENT_ICON = { alarm: 'bell', motion: 'motion', battery: 'battery', system: 'shield' };

  function renderEvent(ev, now) {
    return el('div', { class: 'sn-event sn-event--' + ev.kind }, [
      el('div', { class: 'sn-event__rail' }, [
        el('span', { class: 'sn-event__node', html: icon(EVENT_ICON[ev.kind] || 'shield', { size: 15 }) }),
        el('span', { class: 'sn-event__line' })
      ]),
      el('div', { class: 'sn-event__body' }, [
        el('div', { class: 'sn-event__text', text: ev.text }),
        el('div', { class: 'sn-event__at', text: S.relativeTime(ev.at, now) })
      ])
    ]);
  }

  function renderCamera(cam, now) {
    var live = cam.status === 'live';
    return el('div', { class: 'sn-cam' + (live ? '' : ' sn-cam--offline') }, [
      el('div', { class: 'sn-cam__view', html: icon('camera', { size: 26 }) },
        live ? [el('span', { class: 'sn-cam__live' }, [
          el('span', { class: 'n-dot' }), el('span', { text: 'LIVE' })
        ])] : []
      ),
      el('div', { class: 'sn-cam__foot' }, [
        el('div', { class: 'sn-cam__name', text: cam.name }),
        el('div', {
          class: 'sn-cam__meta',
          text: live ? 'Motion ' + S.relativeTime(cam.lastMotion, now) : 'Offline'
        })
      ])
    ]);
  }

  /* =========================================================================
     Tabs
     ====================================================================== */

  function tabHome(s, now) {
    var kids = [];

    kids.push(renderHero(s));
    kids.push(renderModes(s));

    kids.push(section('Sensors', null,
      el('div', { class: 'sn-list' }, s.sensors.map(function (x) {
        return renderSensorRow(x, s);
      }))
    ));

    kids.push(section('Recent activity',
      { label: 'See all', onClick: function () { setTab('events'); } },
      el('div', { class: 'sn-events' }, s.events.slice(0, 3).map(function (e) {
        return renderEvent(e, now);
      }))
    ));

    return kids;
  }

  function tabCameras(s, now) {
    return [
      section('Cameras', null,
        el('div', { class: 'sn-cams' }, s.cameras.map(function (c) {
          return renderCamera(c, now);
        }))
      )
    ];
  }

  function tabEvents(s, now) {
    if (!s.events.length) {
      return [el('div', { class: 'sn-empty', text: 'No activity recorded yet.' })];
    }
    return [
      section('Activity', null,
        el('div', { class: 'sn-events' }, s.events.map(function (e) {
          return renderEvent(e, now);
        }))
      )
    ];
  }

  function tabSettings(s) {
    var rows = [
      { label: 'Property', value: s.property },
      { label: 'Exit delay', value: S.EXIT_DELAY + 's' },
      { label: 'Entry delay', value: '30s' },
      { label: 'Siren volume', value: 'High' },
      { label: 'Notifications', value: 'All events' },
      { label: 'Emergency contacts', value: '3' }
    ];
    return [
      section('System', null,
        el('div', { class: 'sn-set' }, rows.map(function (r) {
          return el('div', { class: 'sn-set__row', role: 'button', tabindex: '0' }, [
            el('span', { class: 'sn-set__label', text: r.label }),
            el('span', { class: 'sn-set__value', text: r.value }),
            el('span', { html: icon('chevron', { size: 15 }) })
          ]);
        }))
      )
    ];
  }

  var TABS = [
    { id: 'home',     label: 'Home',    icon: 'shield' },
    { id: 'cameras',  label: 'Cameras', icon: 'camera' },
    { id: 'events',   label: 'Activity',icon: 'clock' },
    { id: 'settings', label: 'Settings',icon: 'gear' }
  ];

  var VIEWS = { home: tabHome, cameras: tabCameras, events: tabEvents, settings: tabSettings };

  /* =========================================================================
     Mount + render
     ====================================================================== */

  function boot(root) {
    var tabbar = el('nav', { class: 'sn-tabbar', role: 'tablist' });
    var frame = global.IOSFrame.mount(root, { footer: tabbar });

    var app = el('div', { class: 'sn' });
    frame.body.appendChild(app);

    function render(s) {
      var now = Date.now();
      var scroll = frame.body.scrollTop;

      /* --- header + tab content --- */
      app.innerHTML = '';
      app.appendChild(el('header', { class: 'sn-header' }, [
        el('div', {}, [
          el('p', { class: 'sn-header__eyebrow', text: s.property }),
          el('h1', { class: 'sn-header__title', text: 'Sentinelle' })
        ]),
        el('button', {
          class: 'sn-header__btn', type: 'button', 'aria-label': 'Settings',
          html: icon('gear', { size: 18 }),
          onclick: function () { setTab('settings'); }
        })
      ]));

      (VIEWS[s.tab] || tabHome)(s, now).forEach(function (n) { app.appendChild(n); });

      /* --- tab bar --- */
      tabbar.innerHTML = '';
      TABS.forEach(function (t) {
        var kids = [
          el('span', { html: icon(t.icon, { size: 21 }) }),
          el('span', { text: t.label })
        ];
        if (t.id === 'events' && unseen > 0) {
          kids.splice(1, 0, el('span', { class: 'sn-tab__badge', text: String(unseen) }));
        }
        tabbar.appendChild(el('button', {
          class: 'sn-tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(s.tab === t.id),
          onclick: function () { setTab(t.id); }
        }, kids));
      });

      frame.body.scrollTop = scroll;
    }

    store.subscribe(render);
    render(store.get());

    /* Keep relative timestamps fresh. */
    setInterval(function () { render(store.get()); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot(document.getElementById('frame-root'));
  });

  global.Sentinelle = { store: store, setMode: setMode, toggleSensor: toggleSensor };
})(window);
