#!/usr/bin/env bash
# Runs scripts/build-apk.sh inside the toolchain image from ./Dockerfile.
#
# One definition of the invocation, called identically by android-image.yml on a
# pull request and by build-apk on a release. Two copies that drift is how a
# release path stops resembling the one that was tested.
#
#   docker build -t novaguard-android .
#   scripts/build-apk-in-docker.sh novaguard-android
#
# APK_CACHE_DIR relocates the Gradle and npm caches; CI points it at a directory
# it restores between runs so the container starts cold but the downloads do not.
set -euo pipefail

IMAGE="${1:?usage: build-apk-in-docker.sh <image-ref> [gradle args...]}"
shift

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${APK_CACHE_DIR:-${ROOT}/.ci-cache}"
mkdir -p "${CACHE}/gradle" "${CACHE}/npm"

# Running as the invoking user keeps Gradle from leaving root-owned build
# directories behind — on CI that breaks the later artifact upload, and on a
# developer's machine it leaves a checkout they cannot clean without sudo.
# HOME is redirected because that user has none inside the image.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${ROOT}":/app -w /app \
  -v "${CACHE}/gradle":/gradle-home \
  -v "${CACHE}/npm":/npm-cache \
  -e GRADLE_USER_HOME=/gradle-home \
  -e npm_config_cache=/npm-cache \
  -e HOME=/tmp \
  "${IMAGE}" \
  scripts/build-apk.sh "$@"
