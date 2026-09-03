# Dealerlink dev container
# Base pinned to match .nvmrc (20.18.0) and apps/workers/Dockerfile.
FROM node:20.18.0-bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget gnupg jq git openssh-client less procps \
      # psql — DEV.58 recorded this missing on the old build machine; runbooks need it
      postgresql-client \
      # Chromium itself (@sparticuz/chromium is x64-only; dev falls back to system chromium)
      chromium \
      # Chromium runtime libs — same list proven in apps/workers/Dockerfile (DEV.63)
      libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libxkbcommon0 \
      libpango-1.0-0 libgtk-3-0 libasound2 libxcomposite1 libxdamage1 \
      libxrandr2 libxshmfence1 libxss1 libxtst6 \
      fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# doctl — latest release, architecture-matched. Needed by pnpm sync-spec:* (R18).
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    ver="$(curl -fsSL https://api.github.com/repos/digitalocean/doctl/releases/latest \
           | jq -r .tag_name | sed 's/^v//')"; \
    curl -fsSL "https://github.com/digitalocean/doctl/releases/download/v${ver}/doctl-${ver}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin doctl; \
    doctl version

# pnpm pinned to the packageManager field in package.json
RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.9 --activate

USER node

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
    NPM_CONFIG_PREFIX=/home/node/.npm-global \
    PATH=/home/node/.npm-global/bin:/home/node/.local/share/pnpm:$PATH

RUN mkdir -p /home/node/.npm-global /home/node/.claude \
             /home/node/.local/share/pnpm /home/node/.cache/ms-playwright \
 && npm install -g @anthropic-ai/claude-code
