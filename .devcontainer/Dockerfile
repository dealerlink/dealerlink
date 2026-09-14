# Dealerlink dev container
# Base pinned to match .nvmrc (20.18.0) and apps/workers/Dockerfile.
FROM node:20.18.0-bookworm-slim

# perl/psql emit locale warnings on every invocation without this
ENV LANG=C.UTF-8

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg jq git openssh-client less procps iproute2 \
      # xz — Typst ships Linux builds ONLY as .tar.xz and GNU tar shells out to
      # the xz binary for -J. Without this, `pnpm typst:install` cannot unpack a
      # release, which is the blocker F.66 recorded: the Day 25 spike had to pull
      # a pure-JS decoder into /tmp to get a binary at all.
      xz-utils \
      # Chromium. NOT for PDF rendering any more — that is Typst as of Day 27,
      # and puppeteer is gone. This is Playwright's business: the e2e suite runs
      # a real browser, and Playwright's own Chromium links the same shared
      # libraries. The package itself is kept as a fallback browser for manual
      # debugging; the LIBRARIES below are load-bearing for e2e.
      chromium \
      # Browser runtime libs — list proven in apps/workers/Dockerfile (DEV.63)
      libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libxkbcommon0 \
      libpango-1.0-0 libgtk-3-0 libasound2 libxcomposite1 libxdamage1 \
      libxrandr2 libxshmfence1 libxss1 libxtst6 \
      fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# psql 16 from PGDG — bookworm ships 15, and pg_dump refuses to run against a
# newer server, which breaks the DR restore runbook.
RUN set -eux; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/keyrings/pgdg.asc; \
    echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-16; \
    rm -rf /var/lib/apt/lists/*

# doctl — latest release, architecture-matched. Needed by pnpm sync-spec:* (R18).
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    ver="$(curl -fsSL https://api.github.com/repos/digitalocean/doctl/releases/latest \
           | jq -r .tag_name | sed 's/^v//')"; \
    curl -fsSL "https://github.com/digitalocean/doctl/releases/download/v${ver}/doctl-${ver}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin doctl; \
    doctl version

# GitHub CLI — from GitHub's own apt repo (Debian ships no `gh` package).
# Needed from Day 22 onward: days land via branch + PR with green CI, so
# `gh pr create` / `gh pr checks` / `gh run watch` are part of the closeout.
# Same keyring + signed-by pattern as the PGDG block above.
RUN set -eux; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg; \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gh; \
    rm -rf /var/lib/apt/lists/*; \
    gh --version

# pnpm pinned to the packageManager field in package.json
RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.9 --activate

USER node

# PUPPETEER_EXECUTABLE_PATH is gone (Day 27). It pointed puppeteer at the
# system Chromium because @sparticuz/chromium ships x86-64 only and this
# container is arm64 — the divergence DEV.89 recorded and F.32 tracked. With
# puppeteer removed there is nothing left to point.
#
# It had a second effect worth remembering: because it was set at the image
# level, the Day 25 reference capture silently used /usr/bin/chromium rather
# than the binary the capture script would otherwise have chosen. An env var set
# in an image is an invisible input to everything that runs in it.
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
    NPM_CONFIG_PREFIX=/home/node/.npm-global \
    PNPM_STORE_PATH=/home/node/.local/share/pnpm/store \
    # ~/.local/bin is where scripts/install-typst.mjs puts the pinned Typst
    # binary. Without it on PATH the renderer cannot find typst and fails at
    # render time rather than at install time.
    PATH=/home/node/.local/bin:/home/node/.npm-global/bin:/home/node/.local/share/pnpm:$PATH

RUN mkdir -p /home/node/.npm-global /home/node/.claude \
             /home/node/.local/share/pnpm /home/node/.cache/ms-playwright \
 && npm install -g @anthropic-ai/claude-code

# The workspace is bind-mounted from macOS so its uid does not match `node`;
# without this git aborts subprocesses (including the husky pre-commit hook)
# with "dubious ownership".
RUN git config --global --add safe.directory /workspace

RUN printf 'store-dir=/home/node/.local/share/pnpm/store\n' > /home/node/.npmrc