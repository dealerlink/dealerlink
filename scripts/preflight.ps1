# Preflight wrapper for PowerShell — delegates to the Node script.
# The real checks live in preflight.mjs so Windows and POSIX share one impl.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $here 'preflight.mjs') @args
exit $LASTEXITCODE
