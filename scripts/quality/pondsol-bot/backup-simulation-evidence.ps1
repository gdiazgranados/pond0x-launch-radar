# PondSOL 2C-C4: evidence backup only; never authorizes recovery.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SnapshotPath,
  [Parameter(Mandatory=$true)][string]$BackupRoot
)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($SnapshotPath)
$lock = "$source.lock"
$root = [IO.Path]::GetFullPath($BackupRoot)
$comparison = [StringComparison]::OrdinalIgnoreCase
function Within([string]$path, [string]$parent) {
  $p = $parent.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  return $path.Equals($p, $comparison) -or $path.StartsWith($p + [IO.Path]::DirectorySeparatorChar, $comparison)
}
$sourceParent = [IO.Path]::GetDirectoryName($source)
if ((Within $root $sourceParent) -or (Within $sourceParent $root)) {
  throw 'BackupRoot and source directory must be disjoint'
}
if (-not (Test-Path -LiteralPath $sourceParent -PathType Container)) { throw 'Source directory missing' }
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'BackupRoot must be an existing directory' }
function Reject-Link([string]$path) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point refused: $path" }
  return $item
}
# Reject reparse points in the ancestor chain, including the destination.
foreach ($target in @($sourceParent, $root)) {
  $cursor = $target
  while ($cursor) {
    $null = Reject-Link $cursor
    $next = [IO.Path]::GetDirectoryName($cursor.TrimEnd('\','/'))
    if (-not $next -or $next -eq $cursor) { break }
    $cursor = $next
  }
}
$run = Join-Path $root ('pondsol-evidence-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -ErrorAction Stop | Out-Null
$manifestPath = Join-Path $run 'manifest.json'
$manifest = [ordered]@{
  schemaVersion = 1
  status = 'INCOMPLETE'
  snapshotPath = $source
  capturedAtUtc = [DateTime]::UtcNow.ToString('o')
  recoveryAuthorized = $false
  exclusiveAccessVerified = $false
  files = @()
  absent = @()
  errors = @()
}
function Save-Manifest {
  $json = ConvertTo-Json -InputObject $manifest -Depth 10
  $temporary = Join-Path $run ('manifest-' + [guid]::NewGuid().ToString('N') + '.tmp')

  try {
    [IO.File]::WriteAllText(
      $temporary,
      $json + "`n",
      (New-Object System.Text.UTF8Encoding($false))
    )

    if (Test-Path -LiteralPath $manifestPath) {
      $previous = Join-Path $run ('manifest-previous-' + [guid]::NewGuid().ToString('N') + '.bak')
      [IO.File]::Replace($temporary, $manifestPath, $previous)
      if (Test-Path -LiteralPath $previous) {
        try {
          Remove-Item -LiteralPath $previous -Force -ErrorAction Stop
        }
        catch {
          Write-Warning "Previous manifest cleanup failed: $($_.Exception.Message)"
        }
      }
    }
    else {
      [IO.File]::Move($temporary, $manifestPath)
    }
  }
  finally {
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force
    }
  }
}
function Get-LockIdentity([string]$path) {
  $item = Reject-Link $path
  if (-not $item.PSIsContainer) {
    throw "Lock is not a directory: $path"
  }
  $output = @(& fsutil.exe file queryfileid $path 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot query lock identity: $path"
  }
  $value = ($output | Out-String)
  if ($value -notmatch '(?i)0x[0-9a-f]{16,32}') {
    throw "Invalid lock identity: $path"
  }
  return $Matches[0].ToUpperInvariant()
}
function Get-FileIdentity([string]$path) {
  $item = Reject-Link $path
  if ($item.PSIsContainer) { throw "Expected file: $path" }

  $output = @(& fsutil.exe file queryfileid $path 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot query file identity: $path"
  }

  $value = ($output | Out-String)
  if ($value -notmatch '(?i)0x[0-9a-f]{16,32}') {
    throw "Invalid file identity: $path"
  }

  return $Matches[0].ToUpperInvariant()
}
function File-Record([string]$path, [string]$dest) {
  $item = Reject-Link $path
  if ($item.PSIsContainer) { throw "Unexpected directory: $path" }
  $identityBefore = Get-FileIdentity $path
  $before = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash
  $bytesBefore = $item.Length
  Copy-Item -LiteralPath $path -Destination $dest -ErrorAction Stop
  $identityAfter = Get-FileIdentity $path
  if ($identityBefore -cne $identityAfter) {
    throw "File identity changed during backup: $path"
  }
  $after = (Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash
  $copied = (Get-FileHash -LiteralPath $dest -Algorithm SHA256 -ErrorAction Stop).Hash
  $bytesAfter = (Get-Item -LiteralPath $path -Force).Length
  if ($before -ne $after -or $before -ne $copied -or $bytesBefore -ne $bytesAfter) {
    throw "Changed during backup: $path"
  }
  $manifest.files += [ordered]@{ source=$path; backup=$dest; sha256=$before; bytes=$bytesBefore; fileId=$identityBefore }
}
try {
  Save-Manifest
  $snapshotName = [IO.Path]::GetFileName($source)
  if (Test-Path -LiteralPath $source) { File-Record $source (Join-Path $run 'snapshot.json') }
  else { $manifest.absent += 'snapshot' }
  if (Test-Path -LiteralPath $lock) {
    $lockIdentityBefore = Get-LockIdentity $lock
    $lockItem = Reject-Link $lock
    if (-not $lockItem.PSIsContainer) { throw 'Lock path is not a directory' }
    $entries = @(Get-ChildItem -LiteralPath $lock -Force -ErrorAction Stop)
    foreach ($entry in $entries) {
      if ($entry.Name -ne 'owner.json' -or $entry.PSIsContainer) { throw "Unexpected lock entry: $($entry.FullName)" }
      File-Record $entry.FullName (Join-Path $run 'owner.json')
    }
    if ($entries.Count -eq 0) { $manifest.absent += 'owner.json' }
  } else { $manifest.absent += 'lock directory' }
  $prefix = '.' + $snapshotName + '.'
  $suffix = '.tmp'
  $tempFiles = @(Get-ChildItem -LiteralPath $sourceParent -Force -ErrorAction Stop | Where-Object {
    $_.Name.StartsWith($prefix, [StringComparison]::Ordinal) -and $_.Name.EndsWith($suffix, [StringComparison]::Ordinal)
  })
  foreach ($file in $tempFiles) {
    $uuid = $file.Name.Substring($prefix.Length, $file.Name.Length - $prefix.Length - $suffix.Length)
    $parsed = [guid]::Empty
    if (-not [guid]::TryParseExact($uuid, 'D', [ref]$parsed)) { throw "Unexpected temporary file name: $($file.Name)" }
    File-Record $file.FullName (Join-Path $run ('temp-' + $uuid + '.tmp'))
  }
  if ($tempFiles.Count -eq 0) { $manifest.absent += 'temporary files' }
  # Re-enumerate to detect additions/removals and re-check every source hash.
  $currentLockEntries = if (Test-Path -LiteralPath $lock -PathType Container) { @(Get-ChildItem -LiteralPath $lock -Force | ForEach-Object FullName) } else { @() }
  $initialLockEntries = @($manifest.files | Where-Object { $_.source.StartsWith($lock + [IO.Path]::DirectorySeparatorChar, $comparison) } | ForEach-Object source)

  if ((($currentLockEntries | Sort-Object) -join '|') -cne (($initialLockEntries | Sort-Object) -join '|')) { throw 'Lock entries changed during backup' }
  $currentTemps = @(Get-ChildItem -LiteralPath $sourceParent -Force | Where-Object { $_.Name.StartsWith($prefix, [StringComparison]::Ordinal) -and $_.Name.EndsWith($suffix, [StringComparison]::Ordinal) } | ForEach-Object FullName)
  if ((($currentTemps | Sort-Object) -join '|') -cne ((@($tempFiles | ForEach-Object FullName) | Sort-Object) -join '|')) { throw 'Temporary entries changed during backup' }
  foreach ($record in $manifest.files) {
    if ((Get-FileIdentity $record.source) -cne $record.fileId) {
      throw "Source identity changed after copy: $($record.source)"
    }
    if ((Get-FileHash -LiteralPath $record.source -Algorithm SHA256).Hash -ne $record.sha256) { throw "Source changed after copy: $($record.source)" }
  }
  if ('snapshot' -in $manifest.absent -and (Test-Path -LiteralPath $source)) { throw 'Snapshot appeared during backup' }
  if ('lock directory' -in $manifest.absent -and (Test-Path -LiteralPath $lock)) { throw 'Lock appeared during backup' }
  if ($lockIdentityBefore) {
    if (-not (Test-Path -LiteralPath $lock -PathType Container)) {
      throw 'Lock disappeared during backup'
    }
    $lockIdentityAfter = Get-LockIdentity $lock
    if ($lockIdentityBefore -cne $lockIdentityAfter) {
      throw 'Lock directory identity changed during backup'
    }
    foreach ($entry in @(Get-ChildItem -LiteralPath $lock -Force)) {
      $null = Reject-Link $entry.FullName
    }
  }
  $manifest.status = 'EVIDENCE_COPIED_NOT_CONSISTENCY_GUARANTEED'
  Save-Manifest
  Write-Host "EVIDENCE BACKUP: $run"
  Write-Host "STATUS: $($manifest.status)"
  Write-Host 'RECOVERY AUTHORIZED: NO'
} catch {
  $manifest.status = 'INCOMPLETE'
  $manifest.errors += $_.Exception.Message
  Save-Manifest
  throw "Evidence backup incomplete ($run): $($_.Exception.Message)"
}
