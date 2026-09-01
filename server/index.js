/* ===========================================================================
   Sentinelle backend: serves the client and exposes the panel over HTTP.

   Zero runtime dependencies — node: builtins only.
   =========================================================================== */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Panel } from './panel.js';
import { seed } from './seed.js';
import { load, persistOnChange } from './persist.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const PORT = Number(process.env.PORT || 8787);
/* Loopback by default: an unauthenticated panel API must not be reachable
   from the network just because someone started the server. */
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.SENTINELLE_TOKEN || null;
const TEST_MODE = process.env.SENTINELLE_TEST === '1';
const EXIT_DELAY = Number(process.env.SENTINELLE_EXIT_DELAY || 30);
const STATE_FILE = process.env.SENTINELLE_STATE_FILE || join(ROOT, 'server', 'data', 'state.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('body is not valid JSON'), { status: 400 });
  }
}

/** Serve a file from the repo root, refusing anything that escapes it. */
async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = resolve(ROOT, rel);

  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    return json(res, 403, { error: 'forbidden' });
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

export function createApp(panel) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { error: 'method not allowed' });
      }
      return serveStatic(req, res, path);
    }

    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      return json(res, 401, { error: 'unauthorized' });
    }

    try {
      /* --- reading --- */
      if (req.method === 'GET' && path === '/api/state') {
        return json(res, 200, panel.snapshot);
      }

      if (req.method === 'GET' && path === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        const send = (snap) => res.write(`data: ${JSON.stringify(snap)}\n\n`);
        send(panel.snapshot);
        const off = panel.subscribe(send);
        /* Comment frames keep intermediaries from closing an idle stream. */
        const beat = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { off(); clearInterval(beat); });
        return undefined;
      }

      /* --- commands --- */
      if (req.method === 'POST' && path === '/api/mode') {
        const { mode } = await readBody(req);
        return json(res, 200, panel.setMode(mode));
      }

      const toggle = path.match(/^\/api\/sensors\/([\w-]+)\/toggle$/);
      if (req.method === 'POST' && toggle) {
        return json(res, 200, panel.toggleSensor(toggle[1]));
      }

      if (req.method === 'POST' && path === '/api/alarm/dismiss') {
        return json(res, 200, panel.dismissAlarm());
      }

      if (req.method === 'POST' && path === '/api/alarm/call-help') {
        return json(res, 200, panel.callHelp());
      }

      /* Exists only under SENTINELLE_TEST=1 so the suite can start each test
         from a known panel. It is not routed at all in normal operation. */
      if (TEST_MODE && req.method === 'POST' && path === '/api/test/reset') {
        return json(res, 200, panel.reset(seed()));
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message });
    }
  };
}

export async function start() {
  const persisted = await load(STATE_FILE);
  const panel = new Panel(persisted || seed(), { exitDelay: EXIT_DELAY });
  persistOnChange(panel, STATE_FILE);

  const server = createServer(createApp(panel));
  await new Promise((ok) => server.listen(PORT, HOST, ok));

  const where = `http://${HOST}:${PORT}`;
  process.stdout.write(
    `Sentinelle on ${where}  (state: ${persisted ? 'restored' : 'seeded'}, ` +
    `exit delay: ${EXIT_DELAY}s, auth: ${TOKEN ? 'token' : 'none'})\n`
  );

  const shutdown = () => { panel.close(); server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, panel };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  start();
}
