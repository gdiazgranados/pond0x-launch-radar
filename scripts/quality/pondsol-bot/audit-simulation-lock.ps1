# PondSOL 2C-C2: read-only lock evidence collection (PowerShell 5.1+).
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SnapshotPath,
  [Parameter(Mandatory=$true)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
$fullSnapshot = [IO.Path]::GetFullPath($SnapshotPath)
$lockPath = "$fullSnapshot.lock"
$fullReport = [IO.Path]::GetFullPath($ReportPath)
if ($fullReport -eq $fullSnapshot -or $fullReport.StartsWith($lockPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $fullReport -eq $lockPath) { throw 'Report path overlaps protected state' }
if ([IO.Path]::GetDirectoryName($fullReport) -eq $null) { throw 'Invalid report path' }
if (Test-Path -LiteralPath $fullReport) { throw 'Report already exists: refusing overwrite' }
$lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$s) { $script:lines.Add($s) }
function Describe-File([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Add-Line "MISSING FILE: $path"; return }
  try {
    $item = Get-Item -LiteralPath $path -Force
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    Add-Line "FILE: $($item.FullName) | bytes=$($item.Length) | UTC=$($item.LastWriteTimeUtc.ToString('o')) | SHA256=$hash"
  } catch { Add-Line "FILE INSPECTION ERROR: $path | $($_.Exception.Message)" }
}
Add-Line 'PONDSOL LOCK EVIDENCE / READ ONLY / NO RECOVERY AUTHORIZATION'
Add-Line "Observed UTC: $([DateTime]::UtcNow.ToString('o'))"
Add-Line "Computer: $env:COMPUTERNAME"
Add-Line "Snapshot: $fullSnapshot"
Add-Line "Lock: $lockPath"
Describe-File $fullSnapshot
Add-Line '=== LOCK DIRECTORY ==='
if (Test-Path -LiteralPath $lockPath -PathType Container) {
  $dir = Get-Item -LiteralPath $lockPath -Force
  Add-Line "LOCK PRESENT | createdUTC=$($dir.CreationTimeUtc.ToString('o')) | modifiedUTC=$($dir.LastWriteTimeUtc.ToString('o'))"
  Get-ChildItem -LiteralPath $lockPath -Force | ForEach-Object {
    Add-Line "ENTRY: $($_.Name) | type=$($_.GetType().Name)"
    if (-not $_.PSIsContainer) { Describe-File $_.FullName }
  }
  $ownerPath = Join-Path $lockPath 'owner.json'
  if (Test-Path -LiteralPath $ownerPath -PathType Leaf) {
    try {
      $owner = Get-Content -LiteralPath $ownerPath -Raw | ConvertFrom-Json
      Add-Line "OWNER: version=$($owner.version) pid=$($owner.pid) hostname=$($owner.hostname) lockId=$($owner.lockId) acquiredAtUtc=$($owner.acquiredAtUtc)"
      if ($owner.hostname -ne $env:COMPUTERNAME) { Add-Line 'PID STATUS: UNKNOWN (different hostname)' }
      elseif ($null -eq $owner.pid -or "$($owner.pid)" -notmatch '^[1-9][0-9]*$') { Add-Line 'PID STATUS: UNKNOWN (invalid PID)' }
      else {
        try {
          $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.pid)" -ErrorAction Stop
          if ($null -eq $p) { Add-Line 'PID STATUS: NOT FOUND (not proof of safe recovery)' }
          else { Add-Line "PID STATUS: EXISTS | name=$($p.Name) | creation=$($p.CreationDate) | executable=$($p.ExecutablePath)" }
        } catch { Add-Line "PID STATUS: UNKNOWN | $($_.Exception.Message)" }
      }
    } catch { Add-Line "OWNER METADATA: INVALID/UNREADABLE | $($_.Exception.Message)" }
  } else { Add-Line 'OWNER METADATA: MISSING' }
} elseif (Test-Path -LiteralPath $lockPath) { Add-Line 'LOCK PATH EXISTS BUT IS NOT A DIRECTORY' }
else { Add-Line 'LOCK DIRECTORY ABSENT (single observation only)' }
Add-Line '=== SNAPSHOT SIBLING TEMPORARY FILES ==='
$parent = Split-Path -Parent $fullSnapshot
$name = Split-Path -Leaf $fullSnapshot
if (Test-Path -LiteralPath $parent -PathType Container) {
  Get-ChildItem -LiteralPath $parent -File -Force | Where-Object { $_.Name.StartsWith($name + '.', [StringComparison]::OrdinalIgnoreCase) -or $_.Name.StartsWith($name + '-', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Describe-File $_.FullName }
}
Add-Line '=== LIMITS ==='
Add-Line 'No files were modified by this script except the new report. PID reuse, racing processes, and storage durability are NOT ruled out.'
Add-Line 'UNKNOWN or NOT FOUND is NOT permission to delete a lock. Human review and exclusive maintenance window required.'
$reportParent = Split-Path -Parent $fullReport
if (-not (Test-Path -LiteralPath $reportParent -PathType Container)) { throw 'Report parent directory does not exist' }
# CreateNew prevents overwriting an existing report.
$stream = New-Object System.IO.FileStream($fullReport, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
  $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
  try { foreach ($line in $lines) { $writer.WriteLine($line) }; $writer.Flush() } finally { $writer.Dispose() }
} finally { $stream.Dispose() }
Write-Host "READ-ONLY AUDIT CREATED: $fullReport" -ForegroundColor Green
Write-Host 'No recovery action was performed.'
