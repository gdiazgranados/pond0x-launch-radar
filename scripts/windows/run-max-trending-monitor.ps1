[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$npm = Get-Command npm.cmd -ErrorAction Stop

Set-Location -LiteralPath $repoRoot
$env:MAX_ATTENTION_WINDOWS_TOAST = "true"

try {
  & $npm.Source run monitor:max-trending
  if ($LASTEXITCODE -ne 0) {
    throw "MAX trending monitor exited with code $LASTEXITCODE"
  }
}
finally {
  Remove-Item Env:MAX_ATTENTION_WINDOWS_TOAST -ErrorAction SilentlyContinue
}
