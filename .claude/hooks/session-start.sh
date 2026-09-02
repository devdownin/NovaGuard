#!/bin/bash
# Installs what `npm run typecheck`, `npm run lint` and `npm test` need, so a
# web session can run them on its first turn instead of spending one on setup.
#
# Synchronous on purpose: the session starts a little later, but nothing can
# race a half-finished install. Android/iOS toolchains are not set up here —
# `npm run android` needs a local SDK and is not something a web session runs.
set -euo pipefail

# Local sessions manage their own checkout; only the ephemeral remote container
# starts from nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `install`, not `ci`: the container image is cached once this finishes, and
# `ci` deletes node_modules first, which throws that cache away every time.
# The lockfile is still respected — it just is not wiped to start.
npm install --no-audit --no-fund

# Jest resolves Android platform files and reads day boundaries in local time;
# both are pinned in jest.config.js, so nothing extra is exported here.
