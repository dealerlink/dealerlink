# Vendored fonts — why these are in the repository

Typst renders with **only** these files: the renderer passes `--font-path` at
this directory together with `--ignore-system-fonts`, so nothing on the host can
influence a document.

## Why vendor rather than install

The old pipeline asked for Inter and IBM Plex Mono over a Google Fonts `<link>`
**inside every render**. Two defects came with that, and both are removed by
vendoring rather than by switching renderer:

1. **A network dependency in the render path.** If Google were unreachable,
   Chromium fell through to system fonts and produced a differently-typeset
   document with no error — a silent change to a legal document's appearance.
2. **The requested fonts never arrived anyway.** Inter is not installed in any of
   our environments and the fetch did not succeed, so every reference PDF is set
   in Liberation Sans via the fallback chain. The documents have always been
   Liberation; it just was not deliberate.

Vendoring makes that explicit and identical everywhere: the arm64 devcontainer,
the x86-64 CI runners and the x86-64 DO workers image all render from these
exact bytes. It also closes the same class of divergence DEV.89 recorded for the
Chromium binary — a render that depends on what the host happens to have
installed.

## Licence

Liberation Sans and Liberation Mono, SIL Open Font Licence 1.1 — redistribution
is permitted, including bundled with software. Copied from the Debian
`fonts-liberation` package (`/usr/share/fonts/truetype/liberation/`).

## If a font is ever added or changed

Every reference PDF in `docs/pdf-references/` was rendered with these files. A
font change re-typesets every document, so it invalidates the snapshot baseline
— and that baseline can no longer be regenerated, because the Chromium pipeline
that produced it is gone. Treat a font change as a deliberate re-baselining with
operator sign-off, not as a dependency bump.
