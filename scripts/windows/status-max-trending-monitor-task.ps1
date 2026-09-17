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
    Installed = $false
    TaskState = "ABSENT"
    LockExists = Test-Path -LiteralPath $lockPath
    Pid = $null
    ProcessAlive = $false
  }
  exit 0
}

$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
$pidFromLock = $null
$acquiredAt = $null
if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
  try {
    $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
    if ($lock.pid -is [int] -or $lock.pid -is [long]) {
      $pidFromLock = [int]$lock.pid
      $acquiredAt = [string]$lock.acquiredAt
    }
  }
  catch {
    $pidFromLock = $null
    $acquiredAt = $null
  }
}

$processAlive = $false
if ($null -ne $pidFromLock) {
  $processAlive = $null -ne (Get-Process -Id $pidFromLock -ErrorAction SilentlyContinue)
}

[PSCustomObject]@{
  TaskName = $taskName
  Installed = $true
  TaskState = [string]$task.State
  LastRunTime = $taskInfo.LastRunTime
  LastTaskResult = $taskInfo.LastTaskResult
  NextRunTime = $taskInfo.NextRunTime
  LockExists = Test-Path -LiteralPath $lockPath
  Pid = $pidFromLock
  ProcessAlive = $processAlive
  AcquiredAt = $acquiredAt
}
