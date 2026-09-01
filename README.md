# NovaGuard — Sentinelle

Sentinelle is the NovaGuard mobile client: a property security monitor shown
in an iOS device frame.

Open `index.html` in a browser. There is no build step and no dependencies.

## Status: built from design-system defaults

This implementation was written **without access to the source design**. The
Claude Design project could not be read from the session that built it — the
design MCP had no authorization and the project files were never seeded into
the workspace — so the visual language here is a set of reasonable defaults,
not a reproduction of `Sentinelle.dc.html`.

Assumptions made, all of which are worth checking against the real design:

- **Sentinelle** is a home/property security monitor (arm/disarm, sensors,
  cameras, activity log).
- **nocturne** is a dark design system. The palette, type scale, radii and
  elevation in `ds/nocturne/` are invented to match that name.
- The screen is presented inside an iPhone frame, implied by `ios-frame.jsx`.

## Layout

```
index.html              entry point
ds/nocturne/
  styles.css            tokens, primitives, device-frame chrome
  bundle.js             tokens, icon set, `el()` helper
ios-frame.js            iPhone shell (status bar, island, home indicator)
support.js              store, formatters, seed data, domain rules
sentinelle.css          screen styles
sentinelle.js           screen: tabs, arm/disarm state machine, rendering
```

`ds/nocturne/` deliberately mirrors the shape of the design's
`_ds/nocturne-<id>/` bundle so the real `styles.css` and `_ds_bundle.js` can
replace these files directly.

## Swapping in the real design

1. Bring the project in via Claude Design's **Send to Claude Code Web**, which
   seeds `Sentinelle.dc.html`, `_ds/nocturne-<id>/`, `ios-frame.jsx` and
   `support.js` into the workspace.
2. Replace `ds/nocturne/styles.css` and `ds/nocturne/bundle.js` with the real
   bundle. The token names in `:root` are the contract — if the real bundle
   uses different names, update the `var(--n-*)` references in
   `sentinelle.css`.
3. Re-check `sentinelle.css` against the artboards. The structure should hold;
   the values will not.

Note that `ios-frame.js` is a plain factory, not the `.jsx` component the
design imports — the repo has no JSX toolchain. Port it to React when one
exists.

## Behaviour

The prototype is interactive rather than static:

- **Arm modes** — Disarmed / Home / Away. Arming runs a 10s exit delay
  (`Support.EXIT_DELAY`) that can be cancelled.
- **Home vs Away** — motion sensors are ignored in Home mode; contact and
  safety sensors stay active in both.
- **Tapping a sensor** toggles its state, which is how you simulate a door
  opening. Tripping an armed sensor raises the alarm. Smoke alarms whether or
  not the system is armed.
- **Activity** records every transition, and the tab badges unseen events.

`window.Sentinelle` exposes `store`, `setMode` and `toggleSensor` for driving
the screen from the console.

## Stubs

`Call help` logs an event rather than placing a call. Camera tiles are
placeholders — there is no video pipeline. All data is seeded in
`Support.seed()`; nothing is persisted.
