[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "Pond0x MAX Trending Monitor"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$lockPath = Join-Path $repoRoot "private-data\max-trending-monitor.lock"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($null -eq $task) {
  [PSCustomObject]@{
    TaskName = $taskName
    Removed = $false
    Reason = "TASK_NOT_INSTALLED"
    LockExists = Test-Path -LiteralPath $lockPath
  }
  exit 0
}

if ($task.State -eq "Running") {
  Stop-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 2
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false

[PSCustomObject]@{
  TaskName = $taskName
  Removed = $true
  LockExists = Test-Path -LiteralPath $lockPath
  Note = "A stale lock is recovered safely by the next monitor start."
}
