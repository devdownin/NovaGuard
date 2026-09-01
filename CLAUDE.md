# CLAUDE.md

Context for working on this repo. Read `README.md` for the full picture; this
file carries what is easy to get wrong.

## What this is

An alarm system: a Node backend that holds the panel state, a web client it
serves, and an Android WebView shell around that client.

```sh
npm install
npm start          # panel on http://127.0.0.1:8787
npm test           # unit tests, then browser tests
npm run lint
```

The client is **served by the backend**. Opening `index.html` from disk does
not work — it needs the API.

## Pending: the design has never been imported

The client's visual layer was built from **invented defaults**, not from the
source design. Three attempts to reach it failed identically: `DesignSync`
reports no design-system authorization, `/design-login` cannot run in a
non-interactive session, the workspace was never seeded, and the project URL
returns 403.

If this session has the design files, the import is:

1. Replace `ds/nocturne/styles.css` and `ds/nocturne/bundle.js` with the real
   `_ds/nocturne-<id>/` bundle. The `--n-*` token names in `:root` are the
   contract; if the real bundle names them differently, update the `var()`
   references in `sentinelle.css`.
2. Re-check `sentinelle.css` against the artboards. Structure should hold,
   values will not.
3. Re-run `npm test`. The axe specs will fail on any contrast regression.

**Do not let the import overwrite `support.js`.** The design project contains
a file of that name which is canvas scaffolding, unrelated to this one — here
`support.js` is the client's API layer.

**The design is drawn in an iOS frame; the app is Android.** That may just be
how the mockup was made, but if it carries deeper iOS conventions (action
placement, navigation hierarchy, gestures) those need real Material
adaptation, not just dropping the notch.

## Invariants

Breaking any of these silently undoes deliberate work.

- **The panel decides, the client displays.** Arming rules live in
  `server/domain.js`. The snapshot carries conclusions (`tripped`,
  `armedNow`), never the inputs for the client to re-derive. Do not move rules
  back into the browser.
- **An interrupted exit delay must not complete.** A panel restarted while
  arming recovers as disarmed. Covered by a unit test.
- **The device frame must not render in the app.** `?frame=none` selects bare
  mode; the Android shell requests it. Android draws the real status bar.
- **Focus survives every render**, via the `data-*` identities in
  `FOCUS_KEYS`. The 30s heartbeat rewrites `[data-at]` text only — it must
  never re-render, or it steals focus.
- **Contrast floor.** `--n-text-3`, `--n-armed-dim` and `--n-danger-dim` were
  raised to clear WCAG AA. Note that axe only sees what is rendered:
  `.n-chip--armed` is defined but unused, so its contrast is not covered by a
  test. Check pairs by hand when changing the palette.
- **Selectors are `data-*`, not labels.** The Activity tab's badge is part of
  its text, so label matching is unstable.

## Tests

- `server/*.test.js` (`node --test`) — rules, transitions, and what the
  browser cannot reach: restart mid-arming, corrupt state file.
- `tests/*.spec.mjs` (Playwright) — boots the server, drives the real client,
  and scans every tab with axe.

The browser tests share one panel, so they run **serially** and reset between
cases via `POST /api/test/reset`, which is only routed under
`SENTINELLE_TEST=1`. Do not make them parallel without giving each worker its
own panel.

Sandboxes with a preinstalled Chromium: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`.

## Android

`android/` builds in CI only. Restricted containers cannot reach
`dl.google.com` — neither the SDK nor Google's Maven repo — so `./gradlew
assembleDebug` will fail locally there. CI uploads debug and release APKs as
the `sentinelle-apk` artifact.

Release is signed with the **debug key** so CI produces something installable.
Replace it with a real keystore before distributing.

Because the shell is a WebView onto the panel's own client, a design change
needs no APK rebuild — replace the CSS, restart the panel.

## Known gaps

- **No authentication.** Anyone who reaches the API can disarm. `HOST`
  defaults to `127.0.0.1` for that reason. `SENTINELLE_TOKEN` is a stopgap for
  programmatic callers and does not work with the browser client, because
  `EventSource` cannot send headers.
- Camera tiles are placeholders; there is no video pipeline.
