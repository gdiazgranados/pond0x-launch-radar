# PondSOL 2C-C3: conservative, read-only comparison of two audit reports.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$FirstReport,
  [Parameter(Mandatory=$true)][string]$SecondReport
)
$ErrorActionPreference = 'Stop'
function Read-Report([string]$path) {
  $full = [IO.Path]::GetFullPath($path)
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing report: $full" }
  $lines = @(Get-Content -LiteralPath $full -ErrorAction Stop)
  if ($lines.Count -lt 10 -or $lines[0] -ne 'PONDSOL LOCK EVIDENCE / READ ONLY / NO RECOVERY AUTHORIZATION') { throw "Invalid audit report: $full" }
  if (@($lines | Where-Object { $_ -eq '=== LIMITS ===' }).Count -ne 1) { throw "Incomplete audit report: $full" }
  if (@($lines | Where-Object { $_ -eq '=== SNAPSHOT SIBLING TEMPORARY FILES ===' }).Count -ne 1) { throw "Incomplete audit report: $full" }
  if (@($lines | Where-Object { $_ -like 'No files were modified by this script except*' }).Count -ne 1) { throw "Incomplete audit report: $full" }
  $snapshot = @($lines | Where-Object { $_ -like 'Snapshot: *' })
  $lock = @($lines | Where-Object { $_ -like 'Lock: *' })
  $computer = @($lines | Where-Object { $_ -like 'Computer: *' })
  $observed = @($lines | Where-Object { $_ -like 'Observed UTC: *' })
  if ($snapshot.Count -ne 1 -or $lock.Count -ne 1 -or $computer.Count -ne 1 -or $observed.Count -ne 1) { throw "Ambiguous audit metadata: $full" }
  $time = [datetime]::MinValue
  if (-not [datetime]::TryParseExact($observed[0].Substring(14), 'o', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$time)) { throw "Invalid timestamp: $full" }
  $evidence = @($lines | Where-Object { $_ -like 'FILE: *' -or $_ -like 'MISSING FILE: *' -or $_ -like 'LOCK PRESENT*' -or $_ -like 'LOCK DIRECTORY ABSENT*' -or $_ -like 'LOCK PATH EXISTS*' -or $_ -like 'ENTRY: *' -or $_ -like 'OWNER:*' -or $_ -like 'OWNER METADATA:*' -or $_ -like 'PID STATUS:*' -or $_ -like 'FILE INSPECTION ERROR:*' })
  $owners = @($lines | Where-Object { $_ -like 'OWNER: *' })
  $pids = @($lines | Where-Object { $_ -like 'PID STATUS: *' })
  $lockPresent = @($lines | Where-Object { $_ -like 'LOCK PRESENT*' })
  $unusual = @($evidence | Where-Object { $_ -like '*ERROR:*' -or $_ -like '*UNKNOWN*' -or $_ -like '*INVALID*' -or $_ -like '*MISSING*' -or $_ -like 'LOCK PATH EXISTS*' })
  [pscustomobject]@{ Path=$full; Snapshot=$snapshot[0].Substring(10); Lock=$lock[0].Substring(6); Computer=$computer[0].Substring(10); Time=$time.ToUniversalTime(); Evidence=$evidence; Owners=$owners; Pids=$pids; LockPresent=$lockPresent; Unusual=$unusual }
}
$a = Read-Report $FirstReport
$b = Read-Report $SecondReport
if ($a.Path -eq $b.Path) { throw 'Reports must be different files' }
$reasons = New-Object System.Collections.Generic.List[string]
if ($a.Snapshot -cne $b.Snapshot -or $a.Lock -cne $b.Lock -or $a.Computer -cne $b.Computer) { $reasons.Add('Snapshot, lock path or computer differs') }
if ($a.Time -ge $b.Time) { $reasons.Add('Second audit must be later than first') }
if ($a.Lock -cne ($a.Snapshot + '.lock')) { $reasons.Add('Lock path does not match snapshot') }
if ($a.LockPresent.Count -ne 1 -or $b.LockPresent.Count -ne 1) { $reasons.Add('Lock not present in both reports') }
if ($a.Owners.Count -ne 1 -or $b.Owners.Count -ne 1 -or $a.Owners -cne $b.Owners) { $reasons.Add('Owner identity missing or changed') }
if ($a.Pids.Count -ne 1 -or $b.Pids.Count -ne 1 -or $a.Pids[0] -cne 'PID STATUS: NOT FOUND (not proof of safe recovery)' -or $b.Pids[0] -cne 'PID STATUS: NOT FOUND (not proof of safe recovery)') { $reasons.Add('PID status not consistently NOT FOUND') }
if ($a.Unusual.Count -gt 0 -or $b.Unusual.Count -gt 0) {
  # Expected MISSING FILE for a nonexistent snapshot is still a reason to refuse comparison.
  $reasons.Add('Unknown, missing, invalid or error evidence detected')
}
# Compare file identities/content and directory entries, excluding expected directory timestamps.
$ea = @($a.Evidence | Where-Object { $_ -notlike 'LOCK PRESENT*' })
$eb = @($b.Evidence | Where-Object { $_ -notlike 'LOCK PRESENT*' })
if (($ea -join "`n") -cne ($eb -join "`n")) { $reasons.Add('Evidence changed between observations') }
Write-Host 'PONDSOL 2C-C3 / MANUAL REVIEW ONLY / NO RECOVERY AUTHORIZATION'
Write-Host "Snapshot: $($a.Snapshot)"
Write-Host "First UTC: $($a.Time.ToString('o'))"
Write-Host "Second UTC: $($b.Time.ToString('o'))"
if ($reasons.Count -eq 0) {
  Write-Host 'EVIDENCE RESULT: CONSISTENT CANDIDATE (NOT SAFE TO RECOVER)' -ForegroundColor Yellow
} else {
  Write-Host 'EVIDENCE RESULT: INCONCLUSIVE / DO NOT RECOVER' -ForegroundColor Red
  foreach ($reason in $reasons) { Write-Host " - $reason" }
}
Write-Host 'RECOVERY AUTHORIZED: NO'
Write-Host 'No files were written, renamed, or deleted by this comparison script.'
