# PondSOL 2C-C6 regression suite; isolated fixtures, no recovery.
[CmdletBinding()]
param([string]$BackupScript)

if ([string]::IsNullOrWhiteSpace($BackupScript)) {
    $BackupScript = Join-Path $PSScriptRoot 'backup-simulation-evidence.ps1'
}
$ErrorActionPreference = 'Stop'
$scriptPath = (Resolve-Path -LiteralPath $BackupScript -ErrorAction Stop).Path
$base = Join-Path $env:TEMP ('pondsol-2cc6-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base -ErrorAction Stop | Out-Null
$passed = 0
function Assert([bool]$ok, [string]$message) { if (-not $ok) { throw "FAIL: $message" } }
function Fixture([string]$name) {
  $root = Join-Path $base $name
  $sourceDir = Join-Path $root 'source'
  $backupRoot = Join-Path $root 'backups'
  New-Item -ItemType Directory -Path $sourceDir -Force | Out-Null
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  return @{ source = (Join-Path $sourceDir 'state.json'); backup = $backupRoot; root = $root }
}
function Manifest([string]$backupRoot) {
  $dirs = @(Get-ChildItem -LiteralPath $backupRoot -Directory -Force)
  Assert ($dirs.Count -eq 1) 'Expected exactly one backup directory'
  $path = Join-Path $dirs[0].FullName 'manifest.json'
  Assert (Test-Path -LiteralPath $path -PathType Leaf) 'Manifest missing'
  return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}
function Run-Rejection([string]$name, [string]$path, [string]$backupRoot, [string]$pattern, [string]$runner) {
  $rejected = $false
  try { & $runner -SnapshotPath $path -BackupRoot $backupRoot | Out-Null }
  catch { $rejected = ($_.Exception.Message -match $pattern) }
  Assert $rejected "$name did not reject with expected reason ($pattern)"
  $m = Manifest $backupRoot
  Assert ($m.status -eq 'INCOMPLETE') "$name manifest status"
  Assert ($m.recoveryAuthorized -eq $false) "$name recoveryAuthorized"
  Assert ($m.exclusiveAccessVerified -eq $false) "$name exclusiveAccessVerified"
  Write-Host "PASS: $name" -ForegroundColor Green
  $script:passed++
}
function Inject([string]$name, [string]$needle, [string]$replacement) {
  $code = [IO.File]::ReadAllText($scriptPath)
  $count = [regex]::Matches($code, [regex]::Escape($needle)).Count
  Assert ($count -eq 1) "Injection anchor for $name not unique: $count"
  $path = Join-Path $base ($name + '.ps1')
  [IO.File]::WriteAllText($path, $code.Replace($needle, $replacement), (New-Object Text.UTF8Encoding($false)))
  $tokens = $null; $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors) | Out-Null
  Assert ($parseErrors.Count -eq 0) "Injected script syntax: $name"
  return $path
}
try {
  $f = Fixture 'normal'
  [IO.File]::WriteAllText($f.source, '{"test":"normal"}')
  New-Item -ItemType Directory -Path ($f.source + '.lock') | Out-Null
  [IO.File]::WriteAllText((Join-Path ($f.source + '.lock') 'owner.json'), '{"version":1}')
  & $scriptPath -SnapshotPath $f.source -BackupRoot $f.backup | Out-Null
  $m = Manifest $f.backup
  Assert ($m.status -eq 'EVIDENCE_COPIED_NOT_CONSISTENCY_GUARANTEED') 'Normal backup status'
  Assert ($m.recoveryAuthorized -eq $false -and $m.exclusiveAccessVerified -eq $false) 'Normal safety flags'
  Assert (@($m.files).Count -eq 2) 'Normal file count'
  foreach ($file in $m.files) {
    Assert ((Get-FileHash -LiteralPath $file.backup -Algorithm SHA256).Hash -eq $file.sha256) 'Copied file hash'
    Assert ((Get-Item -LiteralPath $file.backup).Length -eq $file.bytes) 'Copied file size'
  }
  Write-Host 'PASS: normal backup, hashes and flags' -ForegroundColor Green; $passed++

  $f = Fixture 'missing'
  & $scriptPath -SnapshotPath $f.source -BackupRoot $f.backup | Out-Null
  $m = Manifest $f.backup
  Assert ($m.absent -contains 'snapshot') 'Missing snapshot not recorded'
  Assert ($m.recoveryAuthorized -eq $false) 'Missing snapshot recovery flag'
  Write-Host 'PASS: missing snapshot documented' -ForegroundColor Green; $passed++

  $f = Fixture 'unexpected-lock'
  [IO.File]::WriteAllText($f.source, '{}')
  New-Item -ItemType Directory -Path ($f.source + '.lock') | Out-Null
  [IO.File]::WriteAllText((Join-Path ($f.source + '.lock') 'owner.json'), '{}')
  [IO.File]::WriteAllText((Join-Path ($f.source + '.lock') 'unexpected.txt'), 'MUST REJECT')
  Run-Rejection 'unexpected lock entry' $f.source $f.backup 'Unexpected lock entry' $scriptPath

  $f = Fixture 'invalid-temp'
  [IO.File]::WriteAllText($f.source, '{}')
  [IO.File]::WriteAllText((Join-Path (Split-Path $f.source) '.state.json.invalid-uuid.tmp'), 'INVALID')
  Run-Rejection 'invalid temporary filename' $f.source $f.backup 'Unexpected temporary file name' $scriptPath

  $copyNeedle = 'Copy-Item -LiteralPath $path -Destination $dest -ErrorAction Stop'
  $copyReplacement = @'
Copy-Item -LiteralPath $path -Destination $dest -ErrorAction Stop
  if ($path -eq $source) { [IO.File]::AppendAllText($path, "`nRACE_INJECTED") }
'@
  $raceScript = Inject 'race-injected' $copyNeedle $copyReplacement
  $f = Fixture 'race'
  [IO.File]::WriteAllText($f.source, '{"test":"race"}')
  Run-Rejection 'snapshot changed during copy' $f.source $f.backup 'Changed during backup' $raceScript

  $swapNeedle = '    $lockIdentityAfter = Get-LockIdentity $lock'
  $swapReplacement = @'
    $oldLock = "$lock.old"
    Rename-Item -LiteralPath $lock -NewName ([IO.Path]::GetFileName($oldLock))
    New-Item -ItemType Directory -Path $lock | Out-Null
    Copy-Item -LiteralPath (Join-Path $oldLock 'owner.json') -Destination (Join-Path $lock 'owner.json')
    $lockIdentityAfter = Get-LockIdentity $lock
'@
  $swapScript = Inject 'swap-injected' $swapNeedle $swapReplacement
  $f = Fixture 'lock-swap'
  [IO.File]::WriteAllText($f.source, '{"test":"swap"}')
  New-Item -ItemType Directory -Path ($f.source + '.lock') | Out-Null
  [IO.File]::WriteAllText((Join-Path ($f.source + '.lock') 'owner.json'), '{}')
  Run-Rejection 'lock directory replaced' $f.source $f.backup 'Lock directory identity changed' $swapScript

  # Same-content replacement: SHA256 remains equal, File ID changes.
  $identityNeedle = '  $identityAfter = Get-FileIdentity $path'
  $identityReplacement = @"
  if (`$path -eq `$source) {
    `$oldPath = "`$path.original"
    Rename-Item -LiteralPath `$path -NewName ([IO.Path]::GetFileName(`$oldPath))
    Copy-Item -LiteralPath `$oldPath -Destination `$path
  }
  `$identityAfter = Get-FileIdentity `$path
"@

  $identityScript = Inject 'identity-injected' $identityNeedle $identityReplacement

  $f = Fixture 'identity-swap'
  [IO.File]::WriteAllText($f.source, '{"test":"identity"}')

  Run-Rejection 'identical-content file replacement' `
    $f.source $f.backup 'File identity changed during backup' $identityScript

  Write-Host "`nPASS: $passed/7 regression scenarios" -ForegroundColor Green
  Write-Host 'SYMLINK: NOT TESTED (requires permitted link creation)' -ForegroundColor Yellow
  Write-Host 'RECOVERY AUTHORIZED: NO'
  Write-Host "FIXTURES: $base"
} catch {
  Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "FIXTURES RETAINED: $base" -ForegroundColor Yellow
  throw
}
