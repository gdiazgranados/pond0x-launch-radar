[CmdletBinding()]
param(
  [switch]$StartNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$taskName = "Pond0x MAX Trending Monitor"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runnerPath = Join-Path $PSScriptRoot "run-max-trending-monitor.ps1"

if (-not (Test-Path -LiteralPath $runnerPath -PathType Leaf)) {
  throw "MAX trending monitor runner was not found"
}

$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$npm = Get-Command npm.cmd -ErrorAction Stop
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runnerPath + '"'

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 3650)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Watch-only Pond0x MAX Trending monitor with Windows alerts." -Force | Out-Null

if ($StartNow) {
  Start-ScheduledTask -TaskName $taskName
}

[PSCustomObject]@{
  TaskName = $taskName
  Installed = $true
  Started = [bool]$StartNow
  User = $currentUser
  RunLevel = "Limited"
  LogonType = "Interactive"
  MultipleInstances = "IgnoreNew"
  Repository = $repoRoot
  Runner = $runnerPath
  Npm = $npm.Source
}
