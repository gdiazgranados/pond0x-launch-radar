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
  # 2C-C12: manifest safety contract regression.
  $productionCode = [IO.File]::ReadAllText($scriptPath)

  Assert ($productionCode -match 'recoveryAuthorized\s*=\s*\$false') `
    'Recovery authorization must remain false'

  Assert ($productionCode -match 'exclusiveAccessVerified\s*=\s*\$false') `
    'Exclusive access must remain unverified'

  Assert ($productionCode -match "'EVIDENCE_COPIED_NOT_CONSISTENCY_GUARANTEED'") `
    'Successful evidence status must disclaim consistency'

  Assert ($productionCode -match "'INCOMPLETE'") `
    'Incomplete status must remain available'

  Assert ($productionCode -notmatch 'recoveryAuthorized\s*=\s*\$true') `
    'Recovery authorization must never be enabled'

  Assert ($productionCode -notmatch 'exclusiveAccessVerified\s*=\s*\$true') `
    'Exclusive access must never be asserted'

  Write-Host 'PASS: manifest safety contract' -ForegroundColor Green
  $passed++
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

  # 2C-C10A: replace source directory with identical content.
  $directoryNeedle = '  foreach ($directory in $directoryIdentities) {'
  $originalCode = [IO.File]::ReadAllText($scriptPath)
  $first = $originalCode.IndexOf($directoryNeedle, [StringComparison]::Ordinal)
  Assert ($first -ge 0) 'Source directory validation anchor missing'
  $second = $originalCode.IndexOf($directoryNeedle, $first + $directoryNeedle.Length, [StringComparison]::Ordinal)
  Assert ($second -ge 0) 'Catch directory validation anchor missing'
  Assert ($originalCode.IndexOf($directoryNeedle, $second + $directoryNeedle.Length, [StringComparison]::Ordinal) -lt 0) 'Unexpected extra anchor'

  $replacement = @(
    '  [IO.Directory]::Move($sourceParent, ($sourceParent + "-original"))'
    '  [IO.Directory]::CreateDirectory($sourceParent) | Out-Null'
    '  [IO.File]::Copy((Join-Path ($sourceParent + "-original") "state.json"), $source)'
    '  foreach ($directory in $directoryIdentities) {'
  ) -join "`n"

  $injectedCode = $originalCode.Substring(0, $first) + $replacement + $originalCode.Substring($first + $directoryNeedle.Length)
  $sourceScript = Join-Path $base 'directory-source-swap.ps1'
  [IO.File]::WriteAllText($sourceScript, $injectedCode, (New-Object Text.UTF8Encoding($false)))
  $tokens = $null; $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($sourceScript, [ref]$tokens, [ref]$parseErrors) | Out-Null
  Assert ($parseErrors.Count -eq 0) 'Source swap injection syntax'

  $f = Fixture 'directory-source'
  [IO.File]::WriteAllText($f.source, '{"test":"source-swap"}')
  Run-Rejection 'source directory replaced' $f.source $f.backup 'Directory identity changed during backup' $sourceScript

  # 2C-C10B: replace the run directory before final identity validation.
  $runReplacement = @(
    '  [IO.Directory]::Move($run, ($run + "-original"))'
    '  [IO.Directory]::CreateDirectory($run) | Out-Null'
    '  foreach ($directory in $directoryIdentities) {'
  ) -join "`n"

  $runCode = [IO.File]::ReadAllText($scriptPath)
  $runNeedle = '  foreach ($directory in $directoryIdentities) {'
  $runFirst = $runCode.IndexOf($runNeedle, [StringComparison]::Ordinal)
  Assert ($runFirst -ge 0) 'Run validation anchor missing'
  $runSecond = $runCode.IndexOf($runNeedle, $runFirst + $runNeedle.Length, [StringComparison]::Ordinal)
  Assert ($runSecond -ge 0) 'Run catch anchor missing'
  Assert ($runCode.IndexOf($runNeedle, $runSecond + $runNeedle.Length, [StringComparison]::Ordinal) -lt 0) 'Unexpected run anchor'

  $runCode = $runCode.Substring(0, $runFirst) + $runReplacement + $runCode.Substring($runFirst + $runNeedle.Length)
  $runScript = Join-Path $base 'directory-run-swap.ps1'
  [IO.File]::WriteAllText($runScript, $runCode, (New-Object Text.UTF8Encoding($false)))

  $tokens = $null; $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($runScript, [ref]$tokens, [ref]$parseErrors) | Out-Null
  Assert ($parseErrors.Count -eq 0) 'Run swap injection syntax'

  $f = Fixture 'directory-run'
  [IO.File]::WriteAllText($f.source, '{"test":"run-swap"}')

  $runError = $null
  try {
    & $runScript -SnapshotPath $f.source -BackupRoot $f.backup | Out-Null
  } catch {
    $runError = $_.Exception.Message
  }

  Assert ($runError -match 'Directory identity changed during backup') 'Run replacement not detected'
  Assert ($runError -match 'INCOMPLETE manifest not persisted') 'Run manifest persistence failure not reported'

  $runDirs = @(Get-ChildItem -LiteralPath $f.backup -Directory)
  Assert ($runDirs.Count -eq 2) 'Run replacement directory count'

  foreach ($dir in $runDirs) {
    $manifestPath = Join-Path $dir.FullName 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
      $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      Assert ($m.status -eq 'INCOMPLETE') 'Run replacement manifest status'
      Assert ($m.recoveryAuthorized -eq $false) 'Run replacement recovery flag'
      Assert ($m.exclusiveAccessVerified -eq $false) 'Run replacement exclusive flag'
    } else {
      Assert ($dir.Name -notlike '*-original') 'Original run manifest missing'
    }
  }

  Write-Host 'PASS: run directory replaced' -ForegroundColor Green
  $passed++

  # 2C-C10C: replace backup root before final identity validation.
  $rootReplacement = @(
    '  [IO.Directory]::Move($root, ($root + "-original"))'
    '  [IO.Directory]::CreateDirectory($root) | Out-Null'
    '  foreach ($directory in $directoryIdentities) {'
  ) -join "`n"

  $rootCode = [IO.File]::ReadAllText($scriptPath)
  $rootNeedle = '  foreach ($directory in $directoryIdentities) {'
  $rootFirst = $rootCode.IndexOf($rootNeedle, [StringComparison]::Ordinal)
  Assert ($rootFirst -ge 0) 'Root validation anchor missing'
  $rootSecond = $rootCode.IndexOf($rootNeedle, $rootFirst + $rootNeedle.Length, [StringComparison]::Ordinal)
  Assert ($rootSecond -ge 0) 'Root catch anchor missing'
  Assert ($rootCode.IndexOf($rootNeedle, $rootSecond + $rootNeedle.Length, [StringComparison]::Ordinal) -lt 0) 'Unexpected extra root anchor'

  $rootCode = $rootCode.Substring(0, $rootFirst) + $rootReplacement + $rootCode.Substring($rootFirst + $rootNeedle.Length)
  $rootScript = Join-Path $base 'directory-root-swap.ps1'
  [IO.File]::WriteAllText($rootScript, $rootCode, (New-Object Text.UTF8Encoding($false)))

  $tokens = $null; $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($rootScript, [ref]$tokens, [ref]$parseErrors) | Out-Null
  Assert ($parseErrors.Count -eq 0) 'Root swap injection syntax'

  $f = Fixture 'directory-root'
  [IO.File]::WriteAllText($f.source, '{"test":"root-swap"}')

  $rootError = $null
  try {
    & $rootScript -SnapshotPath $f.source -BackupRoot $f.backup | Out-Null
  } catch {
    $rootError = $_.Exception.Message
  }

  Assert ($rootError -match 'Directory identity changed during backup') 'Root replacement not detected'
  Assert ($rootError -match 'INCOMPLETE manifest not persisted') 'Root persistence failure not reported'

  $originalRoot = $f.backup + "-original"
  Assert (Test-Path -LiteralPath $originalRoot -PathType Container) 'Original backup root missing'

  $m = Manifest $originalRoot
  Assert ($m.status -eq 'INCOMPLETE') 'Root replacement manifest status'
  Assert ($m.recoveryAuthorized -eq $false) 'Root replacement recovery flag'
  Assert ($m.exclusiveAccessVerified -eq $false) 'Root replacement exclusive flag'

  $replacementDirs = @(Get-ChildItem -LiteralPath $f.backup -Force)
  Assert ($replacementDirs.Count -eq 0) 'Replacement root unexpectedly populated'

  Write-Host 'PASS: backup root replaced and original error preserved' -ForegroundColor Green
  $passed++

  Write-Host "`nPASS: $passed/11 regression scenarios" -ForegroundColor Green
  Write-Host 'SYMLINK: NOT TESTED (requires permitted link creation)' -ForegroundColor Yellow
  Write-Host 'RECOVERY AUTHORIZED: NO'
  Write-Host "FIXTURES: $base"
} catch {
  Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "FIXTURES RETAINED: $base" -ForegroundColor Yellow
  throw
}
