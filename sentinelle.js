/* ===========================================================================
   sentinelle.js — the Sentinelle screen.
   =========================================================================== */
(function (global) {
  'use strict';

  var N = global.Nocturne;
  var S = global.Support;
  var el = N.el, icon = N.icon;

  var store = S.createStore({
    tab: 'home',
    ready: false,
    connected: false,
    error: null,
    property: '',
    mode: 'off',
    status: 'disarmed',
    countdown: 0,
    exitDelay: null,
    sensors: [],
    cameras: [],
    events: []
  });

  /* Unseen events are counted against the newest event the user has actually
     looked at, so the badge survives server pushes. */
  var seenEventId = null;
  var unseen = 0;

  function markSeen(events) {
    seenEventId = events.length ? events[0].id : '';
    unseen = 0;
  }

  function countUnseen(events) {
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === seenEventId) return i;
    }
    return events.length;
  }

  function apply(snapshot) {
    if (seenEventId === null) {
      markSeen(snapshot.events);
    } else if (store.get().tab === 'events') {
      markSeen(snapshot.events);
    } else {
      unseen = countUnseen(snapshot.events);
    }
    store.set(Object.assign({}, snapshot, { ready: true, error: null }));
  }

  /* A rejected command must surface. Silently leaving the screen showing a
     state the panel never entered is the worst failure mode here. */
  function command(run) {
    return run().then(apply).catch(function (err) {
      store.set({ error: err.message });
    });
  }

  function setMode(mode) {
    return command(function () { return S.api.setMode(mode); });
  }

  function dismissAlarm() {
    return command(function () { return S.api.dismissAlarm(); });
  }

  function callHelp() {
    return command(function () { return S.api.callHelp(); });
  }

  function toggleSensor(id) {
    return command(function () { return S.api.toggleSensor(id); });
  }

  function setTab(tab) {
    if (tab === 'events') markSeen(store.get().events);
    store.set({ tab: tab });
  }

  /* =========================================================================
     View helpers
     ====================================================================== */

  var SENSOR_ICON = { contact: 'door', motion: 'motion', smoke: 'smoke', water: 'window' };

  var HERO = {
    disarmed: { icon: 'off',   label: 'Disarmed' },
    arming:   { icon: 'clock', label: 'Arming…' },
    armed:    { icon: 'check', label: 'Armed' },
    alarm:    { icon: 'bell',  label: 'Alarm' }
  };

  function heroSub(s) {
    if (s.status === 'alarm')  return 'Siren active · Contacts alerted';
    if (s.status === 'arming') return 'Leave now — exit delay running';
    if (s.status === 'armed') {
      return s.mode === 'away' ? 'All zones active' : 'Perimeter active · interior ignored';
    }
    var open = s.sensors.filter(function (x) { return x.tripped; }).length;
    if (!open) return 'All sensors resting';
    return open + (open > 1 ? ' sensors need' : ' sensor needs') + ' attention';
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
        el('button', {
          class: 'n-btn n-btn--danger', 'data-action': 'dismiss',
          text: 'Dismiss', onclick: dismissAlarm
        }),
        el('button', {
          class: 'n-btn n-btn--ghost', 'data-action': 'call-help', text: 'Call help',
          onclick: callHelp
        })
      ]));
    } else if (s.status === 'arming') {
      kids.push(el('div', { class: 'sn-hero__actions' }, [
        el('button', {
          class: 'n-btn n-btn--ghost', 'data-action': 'cancel-arming', text: 'Cancel',
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
          'data-mode': m.id,
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
    var tripped = sensor.tripped;
    var breach = tripped && s.status === 'alarm';
    /* armedNow is the panel's answer, not a rule re-derived here. */
    var ignored = sensor.armedNow === false;

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
      'data-sensor': sensor.id,
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
        class: 'n-section__action', type: 'button', 'data-action': action.id,
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
        el('div', {
          class: 'sn-event__at', 'data-at': String(ev.at),
          text: S.relativeTime(ev.at, now)
        })
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
          'data-at': live ? String(cam.lastMotion) : null,
          'data-at-prefix': live ? 'Motion ' : null,
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
      { id: 'see-all', label: 'See all', onClick: function () { setTab('events'); } },
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
      { label: 'Exit delay', value: s.exitDelay + 's' },
      { label: 'Entry delay', value: '30s' },
      { label: 'Siren volume', value: 'High' },
      { label: 'Notifications', value: 'All events' },
      { label: 'Emergency contacts', value: '3' }
    ];

    /* Inside the Android shell the panel address is an app-level setting, but
       it belongs in the one settings surface the user already knows. */
    if (global.SentinelleHost && global.SentinelleHost.changePanel) {
      rows.unshift({
        label: 'Panel address',
        value: 'Change',
        onClick: function () { global.SentinelleHost.changePanel(); }
      });
    }

    return [
      section('System', null,
        el('div', { class: 'sn-set' }, rows.map(function (r) {
          return el('button', {
            class: 'sn-set__row',
            type: 'button',
            'data-set': r.label.toLowerCase().replace(/\s+/g, '-'),
            onclick: r.onClick || null
          }, [
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

  function banner(kind, text) {
    return el('div', { class: 'sn-banner sn-banner--' + kind }, [
      el('span', { html: icon(kind === 'offline' ? 'off' : 'bell', { size: 18 }) }),
      el('span', { class: 'sn-banner__text', text: text })
    ]);
  }

  /* Controls carry a stable identity so focus can be put back after a
     re-render. Without this every state change strands keyboard users on
     <body>. */
  var FOCUS_KEYS = ['data-tab', 'data-mode', 'data-sensor', 'data-set', 'data-action'];

  function focusSelector(node) {
    if (!node || !node.getAttribute) return null;
    for (var i = 0; i < FOCUS_KEYS.length; i++) {
      var key = FOCUS_KEYS[i];
      if (node.hasAttribute(key)) {
        return '[' + key + '="' + node.getAttribute(key) + '"]';
      }
    }
    return null;
  }

  /* What assistive tech should hear when the system changes state. Only
     transitions are announced — narrating every countdown tick would be
     unusable. */
  function announcement(s) {
    if (!s.ready) return 'Connecting to the panel.';
    if (!s.connected) return 'Connection to the panel lost. Displayed state may be out of date.';
    if (s.status === 'alarm')  return 'Alarm. ' + heroSub(s);
    if (s.status === 'armed')  return 'Armed. ' + heroSub(s);
    if (s.status === 'arming') return 'Arming. Exit delay started.';
    return 'System disarmed.';
  }

  /* Relative timestamps go stale on their own; refreshing them in place is
     far cheaper than rebuilding the screen, and it cannot steal focus. */
  function refreshTimes(root) {
    var now = Date.now();
    var nodes = root.querySelectorAll('[data-at]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      node.textContent = (node.getAttribute('data-at-prefix') || '') +
        S.relativeTime(Number(node.getAttribute('data-at')), now);
    }
  }

  function boot(root) {
    var tabbar = el('nav', {
      class: 'sn-tabbar', role: 'tablist', 'aria-label': 'Sections'
    });
    /* The device frame is a presentation device for the design canvas. Inside
       a real app it must not render — the OS draws the status bar. */
    var bare = /[?&]frame=none\b/.test(global.location.search);
    var frame = global.IOSFrame.mount(root, { footer: tabbar, bare: bare });

    var app = el('div', { class: 'sn' });
    frame.body.appendChild(app);

    var eyebrow = el('p', { class: 'sn-header__eyebrow' });

    /* The header is built once; only the property name is updated. */
    app.appendChild(el('header', { class: 'sn-header' }, [
      el('div', {}, [
        eyebrow,
        el('h1', { class: 'sn-header__title', text: 'Sentinelle' })
      ]),
      el('button', {
        class: 'sn-header__btn', type: 'button', 'aria-label': 'Settings',
        'data-action': 'settings',
        html: icon('gear', { size: 18 }),
        onclick: function () { setTab('settings'); }
      })
    ]));

    var live = el('div', {
      class: 'n-sr-only', role: 'status',
      'aria-live': 'assertive', 'aria-atomic': 'true'
    });
    app.appendChild(live);

    var panel = el('div', { id: 'sn-panel', role: 'tabpanel', tabindex: '-1' });
    app.appendChild(panel);

    var announced = null;

    function render(s) {
      var now = Date.now();
      var scroll = frame.body.scrollTop;
      var refocus = focusSelector(document.activeElement);

      eyebrow.textContent = s.property || '—';

      panel.innerHTML = '';
      panel.setAttribute('aria-labelledby', 'sn-tab-' + s.tab);

      if (!s.ready) {
        panel.appendChild(el('div', { class: 'sn-empty', text: 'Connecting to the panel…' }));
      } else {
        if (!s.connected) {
          panel.appendChild(banner('offline', 'Not connected to the panel. This may be out of date.'));
        }
        if (s.error) panel.appendChild(banner('error', s.error));
        (VIEWS[s.tab] || tabHome)(s, now).forEach(function (n) { panel.appendChild(n); });
      }

      tabbar.innerHTML = '';
      TABS.forEach(function (t) {
        var selected = s.tab === t.id;
        var kids = [
          el('span', { html: icon(t.icon, { size: 21 }) }),
          el('span', { text: t.label })
        ];
        if (t.id === 'events' && unseen > 0) {
          kids.splice(1, 0, el('span', {
            class: 'sn-tab__badge',
            'aria-label': unseen + ' unseen events',
            text: String(unseen)
          }));
        }
        tabbar.appendChild(el('button', {
          class: 'sn-tab',
          type: 'button',
          role: 'tab',
          id: 'sn-tab-' + t.id,
          'data-tab': t.id,
          'aria-controls': 'sn-panel',
          'aria-selected': String(selected),
          /* Roving tabindex: one stop for the whole tablist. */
          tabindex: selected ? '0' : '-1',
          onclick: function () { setTab(t.id); }
        }, kids));
      });

      /* Announce state transitions, not every render. */
      var next = announcement(s);
      if (next !== announced) {
        announced = next;
        live.textContent = next;
      }

      frame.body.scrollTop = scroll;

      if (refocus) {
        var target = app.querySelector(refocus) || tabbar.querySelector(refocus);
        if (target) target.focus();
      }
    }

    /* A tablist owes its users arrow-key navigation. */
    tabbar.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      var index = -1;

      if (step) {
        for (var i = 0; i < TABS.length; i++) {
          if (TABS[i].id === store.get().tab) index = i;
        }
        index = (index + step + TABS.length) % TABS.length;
      } else if (e.key === 'Home') {
        index = 0;
      } else if (e.key === 'End') {
        index = TABS.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      setTab(TABS[index].id);
      var moved = tabbar.querySelector('[data-tab="' + TABS[index].id + '"]');
      if (moved) moved.focus();
    });

    store.subscribe(render);
    render(store.get());

    /* One read to paint immediately, then the stream keeps it live. */
    S.api.state().then(apply).catch(function (err) {
      store.set({ ready: true, error: 'Cannot reach the panel: ' + err.message });
    });

    S.api.stream(apply, function (up) {
      if (store.get().connected !== up) store.set({ connected: up });
    });

    setInterval(function () { refreshTimes(app); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot(document.getElementById('frame-root'));
  });

  global.Sentinelle = {
    store: store, setMode: setMode, toggleSensor: toggleSensor,
    dismissAlarm: dismissAlarm
  };
})(window);
