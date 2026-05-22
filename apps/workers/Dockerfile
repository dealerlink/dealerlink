# syntax=docker/dockerfile:1
#
# Workers component image for DO App Platform (DEV.63).
#
# Why a Dockerfile instead of the Node buildpack: App Platform's default Node
# buildpack runs on a base image that lacks the system shared libraries
# Chromium needs at runtime. @sparticuz/chromium ships the Chromium *binary*
# but dynamically links libnss3 et al at launch, so PDF rendering fails with
#   /tmp/chromium: error while loading shared libraries: libnss3.so
# This image apt-installs those libraries.
#
# The workers process runs straight from TypeScript source via tsx
# (`pnpm --filter workers start` -> `tsx src/index.ts`), and workspace packages
# are consumed as source too — so the image carries the full monorepo plus a
# fresh (Linux) node_modules rather than a compiled dist/.
FROM node:20.18.0-bookworm-slim

# --- Chromium runtime libraries --------------------------------------------
# The shared libs + fonts @sparticuz/chromium links at launch. NOTE: the
# generic Puppeteer troubleshooting list also names `libgconf-2-4`; it is
# intentionally omitted here — that package does not exist on Debian bookworm
# (GConf was removed years ago) and modern Chromium does not use it. Including
# it would make `apt-get install` fail and break the build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libatk-bridge2.0-0 \
      libdrm2 \
      libgbm1 \
      libxkbcommon0 \
      libpango-1.0-0 \
      libgtk-3-0 \
      libasound2 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxshmfence1 \
      libxss1 \
      libxtst6 \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- pnpm via corepack ------------------------------------------------------
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

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
