# NovaGuard — Sentinelle

Sentinelle is the NovaGuard alarm system: a Node backend that holds the panel
state, and a mobile client shown in an iOS device frame.

```sh
npm install
npm start          # http://127.0.0.1:8787
```

## Status: built from design-system defaults

The client was written **without access to the source design**. The Claude
Design project could not be read from the session that built it — the design
MCP had no authorization and the project files were never seeded into the
workspace — so the visual language here is a set of reasonable defaults, not a
reproduction of `Sentinelle.dc.html`.

Assumptions worth checking against the real design:

- **Sentinelle** is a home/property security monitor.
- **nocturne** is a dark design system. The palette, type scale, radii and
  elevation in `ds/nocturne/` are invented to match that name.
- The screen is presented inside an iPhone frame, implied by `ios-frame.jsx`.

## Layout

```
server/
  index.js       http: static files, JSON API, SSE stream
  panel.js       the panel — authoritative state and its transitions
  domain.js      arming rules (pure functions)
  persist.js     atomic JSON persistence
  seed.js        initial contents
index.html       client entry point
ds/nocturne/     design system: tokens, primitives, device-frame chrome
ios-frame.js     iPhone shell
support.js       formatters, store, API client
sentinelle.css   screen styles
sentinelle.js    screen: tabs, rendering, commands
```

`ds/nocturne/` deliberately mirrors the shape of the design's
`_ds/nocturne-<id>/` bundle so the real `styles.css` and `_ds_bundle.js` can
replace these files directly.

Note that `ios-frame.js` is a plain factory, not the `.jsx` component the
design imports — the repo has no JSX toolchain. Port it to React when one
exists.

## The panel decides, the client displays

Arming rules live in `server/domain.js`, not in the browser. A client that
decided for itself could be lied to, so the client sends commands and renders
whatever the panel sends back. The snapshot carries the panel's conclusions —
`tripped`, `armedNow` — rather than the inputs the client would need to
re-derive them.

Behaviour:

- **Arm modes** — Disarmed / Home / Away, with a cancellable exit delay
  (`SENTINELLE_EXIT_DELAY`, 30s by default).
- **Home vs Away** — motion sensors are ignored in Home mode; contact and
  safety sensors stay live in both.
- **Tapping a sensor** toggles it, which is how you simulate a door opening.
  Tripping a live sensor on an armed panel raises the alarm.
- **Life safety** — smoke and water alarm whether or not the panel is armed.
- **Connection state is part of the UI.** If the stream drops, the client says
  so. A security display that goes stale silently is worse than one that
  admits it.

## API

All state changes are pushed; nothing polls.

| | |
|---|---|
| `GET /api/state` | current snapshot |
| `GET /api/stream` | SSE, one frame per state change |
| `POST /api/mode` | `{"mode":"off"\|"home"\|"away"}` |
| `POST /api/sensors/:id/toggle` | simulate a sensor changing state |
| `POST /api/alarm/dismiss` | dismiss and disarm |
| `POST /api/alarm/call-help` | record that contacts were called |

Configuration, all via environment:

| Variable | Default | |
|---|---|---|
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | loopback by default; see below |
| `SENTINELLE_EXIT_DELAY` | `30` | exit delay in seconds |
| `SENTINELLE_STATE_FILE` | `server/data/state.json` | |
| `SENTINELLE_TOKEN` | unset | require `Authorization: Bearer` on `/api/*` |
| `SENTINELLE_TEST` | unset | `1` routes `POST /api/test/reset` |

### Persistence

State is written to a JSON file through a temp file and a rename, so a crash
mid-write cannot leave a file that fails to parse. A corrupt file logs a
warning and boots from seed rather than refusing to start.

An armed panel comes back armed after a restart. An **exit delay** in progress
does not: it recovers as disarmed and logs `Arming abandoned — panel
restarted`, because nobody finished leaving.

### Security posture — read this before exposing it

This is a prototype and its auth story is deliberately incomplete:

- There is **no user authentication**. Anyone who can reach the API can disarm
  the system. That is why `HOST` defaults to `127.0.0.1` — the API is not
  reachable from the network unless you opt in.
- `SENTINELLE_TOKEN` adds a shared bearer token. It is a stopgap for
  programmatic callers, not a login. Note that `EventSource` cannot send
  headers, so **the browser client cannot use the stream when a token is
  set** — that needs cookie or query auth, and query auth leaks credentials
  into logs.
- There is no TLS, no rate limiting, and no audit trail beyond the event log.

Real deployment needs actual accounts and sessions before anything else.

## Development

```sh
npm start          # run the server
npm run dev        # run it with --watch
npm test           # unit tests, then browser tests
npm run test:unit  # node --test over server/
npm run test:e2e   # playwright
npm run lint       # eslint
```

The client is served by the backend; opening `index.html` from disk will not
work, because it needs the API.

Sandboxes that ship a preinstalled Chromium can point at it:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `claude/**`, and on
pull requests into `main`: `npm ci`, lint, then `npm test`. A failing run
uploads the Playwright HTML report as an artifact.

**Unit tests** (`server/*.test.js`) cover the domain rules and the panel's
transitions directly, including cases the browser cannot reach — a restart
mid-arming, a corrupt state file, an interrupted exit delay.

**Browser tests** boot the server and drive the real client:

- the disarmed screen renders and the page logs no console errors
- all four tabs render their own content
- the exit delay counts down and can be cancelled
- arming completes and records the mode
- tripping an armed sensor raises the alarm, and dismissing it disarms
- **Home mode ignores interior motion but still arms the perimeter**
- **smoke alarms even while the system is disarmed**
- the Activity tab badges unseen events and clears them on view
- the sensor summary agrees in number

They share one panel, so they run in sequence and reset it between cases via
`POST /api/test/reset`, which is only routed under `SENTINELLE_TEST=1`.

`tests/a11y.spec.mjs` runs axe-core over every tab and over the alarm state,
and asserts the keyboard and screen-reader behaviour described below.

## Accessibility

The screen re-renders its whole panel on every state change, which is cheap at
this size but has two consequences that are handled explicitly:

- **Focus is restored after each render.** Controls carry a stable identity
  (`data-tab`, `data-mode`, `data-sensor`, `data-set`, `data-action`), and the
  renderer puts focus back where it was. Without this, every state change drops
  keyboard users onto `<body>`.
- **The 30s heartbeat does not re-render.** It only rewrites the text of
  `[data-at]` nodes, so stale relative timestamps refresh without rebuilding
  the DOM or disturbing focus.

Also:

- System state is announced through an `aria-live="assertive"` region, on
  transitions only — narrating each countdown tick would be unusable. Losing
  the connection is announced too.
- The tab bar implements the full tablist pattern: `aria-controls` onto a
  single `role="tabpanel"`, roving tabindex, and Arrow/Home/End navigation.
- Settings rows are real `<button>` elements. They were `<div role="button"
  tabindex="0">` with no key handler, which promises an interaction that does
  not exist.
- `:focus-visible` draws an accent outline; the browser default is close to
  invisible on these surfaces.

### Palette and contrast

Three tokens were adjusted to clear WCAG AA:

| Token | Was | Now | Why |
|---|---|---|---|
| `--n-text-3` | `#5D6980` | `#7F8A9E` | measured 3.0–3.6:1 on the surfaces it sits on; now 4.84:1 at worst |
| `--n-armed-dim` | `#14603F` | `#115234` | backs `--n-armed` as chip text; 4.28:1 → 5.21:1 |
| `--n-danger-dim` | `#6E1A2C` | `#551220` | backs `--n-danger` as chip text; 3.82:1 → 4.73:1 |

Raising `--n-text-3` compresses the grey scale against `--n-text-2`
(`#97A3BC`), which now sit 1.37:1 apart. That is a deliberate trade of
hierarchy for legibility, and worth revisiting against the real design.

Note that axe never flagged `--n-armed-dim`: the `.n-chip--armed` variant is
defined but not currently rendered, so nothing put it on screen to be scanned.
A scanner only sees what you render.

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

Note that the design's `support.js` is a canvas support file, unrelated to the
`support.js` here, which is the client's API layer. Do not let the import
overwrite it.

## Android app

`android/` is a Gradle project that wraps the client in a WebView.

The WebView points straight at the panel, which serves the client, so
everything is same-origin — no bundled copy of the UI that could drift out of
step with the panel it talks to. The trade is that there is no UI without the
panel. For an alarm display that is the honest behaviour: a cached screen
would show a state nobody can vouch for.

- **First run** asks for the panel address (`192.168.1.20:8787` and
  `https://panel.home` are both accepted) and stores it.
- **The device frame is not drawn.** The shell loads `?frame=none`, which
  tells the client to skip the mock iOS chrome — Android draws the real status
  bar. Safe-area insets are honoured.
- **An unreachable panel shows an explicit failure**, not a blank WebView,
  with retry and change-address actions.
- **The panel address lives in the client's Settings tab**, via a small
  JavaScript bridge, so the app keeps one settings surface rather than adding
  native chrome above a UI that already has a header.
- Cleartext HTTP is permitted, because an alarm panel is a device on the local
  network. TLS is used whenever the configured address is `https`.

### Building

The APK is built by CI and uploaded as the `sentinelle-apk` artifact on every
run — debug and release both. Locally:

```sh
cd android && ./gradlew assembleDebug
```

That needs the Android SDK; the environment this was written in could not
reach `dl.google.com`, so the Android build has only ever run in CI.

The release build is signed **with the debug key** so CI can produce something
installable. Replace `signingConfig` in `app/build.gradle.kts` with a real
keystore before distributing anything.

Note that the design this client was based on is an **iOS** frame, while the
app is Android. That may simply be how the mockup was drawn, but it is worth
confirming against the real design.

## Stubs

Camera tiles are placeholders — there is no video pipeline. `Call help`
records an event rather than placing a call.
