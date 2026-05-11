#!/usr/bin/env bash
# Preflight wrapper for POSIX shells — delegates to the Node script.
# (The real checks live in preflight.mjs so Windows and POSIX share one impl.)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/preflight.mjs" "$@"
