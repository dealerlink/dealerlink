# syntax=docker/dockerfile:1
#
# Workers component image for DO App Platform.
#
# DAY 27: this was a Chromium image. It apt-installed libnss3 and a dozen other
# shared libraries because @sparticuz/chromium ships a Chromium binary that
# dynamically links them, and the App Platform Node buildpack's base image does
# not carry them (DEV.63):
#
#   /tmp/chromium: error while loading shared libraries: libnss3.so
#
# None of that is needed now. Rendering is Typst — one statically-linked musl
# binary with no shared-library surface at all — so this is a plain Node image
# plus that binary. The Chromium library list, `fonts-liberation` (the fonts are
# vendored in the repo now, see src/pdf/fonts/README.md) and the emoji font are
# all gone with it.
#
# The workers process runs straight from TypeScript source via tsx
# (`pnpm --filter workers start` -> `tsx src/index.ts`), and workspace packages
# are consumed as source too — so the image carries the full monorepo plus a
# fresh (Linux) node_modules rather than a compiled dist/.
FROM node:20.18.0-bookworm-slim

# --- Typst ------------------------------------------------------------------
# Pinned by version AND by sha256. An unpinned renderer is a renderer whose
# output can change without a commit: Typst's layout engine is not contractually
# stable across versions, and every reference PDF in docs/pdf-references/ was
# produced by this exact build. Those references can no longer be regenerated —
# the Chromium pipeline that made them is gone — so a silent Typst upgrade would
# invalidate a baseline that cannot be rebuilt.
#
# The same version is pinned in three places, and they must agree:
#   - here (the DO workers image, x86-64)
#   - .github/workflows/verify.yml (CI runners, x86-64)
#   - scripts/install-typst.mjs (the arm64 devcontainer)
# DEV.89 was a binary that differed by architecture; this is the thing not to
# repeat while removing it.
ARG TYPST_VERSION=0.15.1
ARG TYPST_SHA256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils \
    && curl -fsSL -o /tmp/typst.tar.xz \
       "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    && echo "${TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/typst.tar.xz -C /tmp \
    && install -m 0755 /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
    && rm -rf /tmp/typst.tar.xz /tmp/typst-x86_64-unknown-linux-musl \
    && apt-get purge -y curl xz-utils && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && typst --version

# --- pnpm -------------------------------------------------------------------
# Installed directly via npm rather than corepack: the corepack bundled with
# this node image fails `corepack prepare pnpm@…` with "Cannot find matching
# keyid" — it ships stale npm-registry signing keys (DEV.65). npm's own
# integrity check installs pnpm fine. Version pinned to match packageManager.
RUN npm install -g pnpm@9.15.9

WORKDIR /app

# Build context is the repo root (.do/app.yaml sets source_dir: /). Copy the
# whole monorepo; .dockerignore keeps host node_modules / build output out so
# the Linux install fetches its own native binaries (e.g. @node-rs/argon2).
COPY . .

RUN pnpm install --frozen-lockfile

# Compile-check the workers package. The runtime executes the TS source via
# tsx, so dist/ is not used at runtime — this step exists to fail the build
# loudly on type drift rather than at container start.
RUN pnpm --filter workers build

# Background worker — exposes no HTTP port.
CMD ["pnpm", "--filter", "workers", "start"]
