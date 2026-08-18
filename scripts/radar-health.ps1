param(
  [int]$HistoryLimit = 20
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param(
    [string]$Title,
    [ConsoleColor]$Color = [ConsoleColor]::Cyan
  )

  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor $Color
}

function Format-Nullable {
  param(
    $Value,
    [string]$Fallback = "--"
  )

  if ($null -eq $Value -or "$Value" -eq "") {
    return $Fallback
  }

  return $Value
}

Write-Section "REFRESH RADAR DATA" Yellow

git fetch origin radar-data | Out-Host

$tempLatest =
  Join-Path $env:TEMP "pond0x-radar-health-latest.json"

$tempHistory =
  Join-Path $env:TEMP "pond0x-radar-health-history.json"

git show origin/radar-data:data/latest.json |
  Set-Content -Encoding utf8 $tempLatest

git show origin/radar-data:data/history.json |
  Set-Content -Encoding utf8 $tempHistory

$latest =
  Get-Content $tempLatest -Raw |
  ConvertFrom-Json

$history =
  Get-Content $tempHistory -Raw |
  ConvertFrom-Json

Write-Section "LATEST SNAPSHOT" Cyan

[PSCustomObject]@{
  Snapshot   = $latest.snapshotId
  Generated  = $latest.generatedAt
  Score      = $latest.score
  Level      = $latest.level
  Alpha      = "$($latest.alphaScore)/$($latest.alphaClass)"
  Trigger    = $latest.triggerState
  Activation = $latest.activationState
} |
  Format-List

Write-Section "EVIDENCE CORRELATION" Green

$evidence =
  $latest.evidenceCorrelation

$activeEvidenceDomains = @()

if ($evidence?.domains) {
  foreach (
    $property in
    $evidence.domains.PSObject.Properties
  ) {
    if ($property.Value -eq $true) {
      $activeEvidenceDomains +=
        $property.Name
    }
  }
}

[PSCustomObject]@{
  Classification =
    Format-Nullable $evidence.classification "UNAVAILABLE"

  EvidenceCount =
    Format-Nullable $evidence.evidenceCount "0"

  DomainCount =
    Format-Nullable $evidence.domainCount "0"

  ActiveDomains =
    if ($activeEvidenceDomains.Count) {
      $activeEvidenceDomains -join ", "
    } else {
      "none"
    }
} |
  Format-List

Write-Section "TEMPORAL CORRELATION" Magenta

$temporal =
  $latest.temporalCorrelation

[PSCustomObject]@{
  Classification =
    Format-Nullable $temporal.classification "UNAVAILABLE"

  WindowMinutes =
    Format-Nullable $temporal.windowMinutes

  DomainCount =
    Format-Nullable $temporal.domainCount "0"

  SpanMinutes =
    Format-Nullable $temporal.spanMinutes

  Sequence =
    if (@($temporal.sequence).Count) {
      @($temporal.sequence) -join " -> "
    } else {
      "none"
    }

  FirstSeen =
    Format-Nullable $temporal.firstSeenAt

  LastSeen =
    Format-Nullable $temporal.lastSeenAt
} |
  Format-List

Write-Section "API RESPONSE DRIFT" Yellow

$drift =
  $latest.discovery.apiResponseDrift

$changedRoutes =
  @($drift.changedRoutes)

[PSCustomObject]@{
  Detected =
    if ($null -eq $drift.detected) {
      "UNAVAILABLE"
    } else {
      $drift.detected
    }

  ChangedRouteCount =
    Format-Nullable $drift.changedRouteCount "0"

  Routes =
    if ($changedRoutes.Count) {
      (
        $changedRoutes |
          ForEach-Object {
            $_.route
          }
      ) -join ", "
    } else {
      "none"
    }
} |
  Format-List

Write-Section "OBSERVABILITY" DarkCyan

$observability =
  $latest.observability

[PSCustomObject]@{
  Status =
    Format-Nullable $observability.status "UNAVAILABLE"

  BlindSpot =
    Format-Nullable $observability.blindSpot

  Degraded =
    Format-Nullable $observability.degraded

  FirstPartyAPI =
    Format-Nullable $observability.firstPartyApiCount

  CapturedResponses =
    Format-Nullable $observability.capturedResponseCount

  Reasons =
    if (@($observability.reasons).Count) {
      @($observability.reasons) -join "; "
    } else {
      "none"
    }
} |
  Format-List

Write-Section "SURFACE DISCOVERY" DarkYellow

$surfaceDiscovery =
  $latest.surfaceDiscovery

$surfaceInventory =
  $surfaceDiscovery?.inventory

$surfaceDrift =
  $surfaceDiscovery?.drift

$observedSurfaceHosts = @(
  $surfaceInventory?.hosts |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    }
)

$newSurfaceHosts = @(
  $surfaceDrift?.newHosts |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    }
)

$missingSurfaceHosts = @(
  $surfaceDrift?.missingHosts |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_)
    }
)

[PSCustomObject]@{
  Status =
    Format-Nullable $surfaceDrift?.status "UNAVAILABLE"

  Comparable =
    Format-Nullable $surfaceDrift?.comparable

  Baseline =
    Format-Nullable $surfaceDrift?.baselineSnapshotId

  ObservedRequests =
    Format-Nullable $surfaceInventory?.requestCount "0"

  FirstParty =
    Format-Nullable $surfaceInventory?.firstPartyRequestCount "0"

  ThirdParty =
    Format-Nullable $surfaceInventory?.thirdPartyRequestCount "0"

  Unknown =
    Format-Nullable $surfaceInventory?.unknownRequestCount "0"

  ObservedHosts =
    $observedSurfaceHosts.Count

  NewSurfaces =
    Format-Nullable $surfaceDrift?.newSurfaceCount "0"

  MissingSurfaces =
    Format-Nullable $surfaceDrift?.missingSurfaceCount "0"

  NewHosts =
    Format-Nullable $surfaceDrift?.newHostCount "0"

  MissingHosts =
    Format-Nullable $surfaceDrift?.missingHostCount "0"
} |
  Format-List

Write-Host "Observed hosts:"

if ($observedSurfaceHosts.Count -gt 0) {
  $observedSurfaceHosts |
    ForEach-Object {
      Write-Host "  $_"
    }
} else {
  Write-Host "  none"
}

if ($newSurfaceHosts.Count -gt 0) {
  Write-Host "`nNew hosts:" -ForegroundColor Green

  $newSurfaceHosts |
    ForEach-Object {
      Write-Host "  + $_"
    }
}

if ($missingSurfaceHosts.Count -gt 0) {
  Write-Host "`nMissing hosts:" -ForegroundColor Yellow

  $missingSurfaceHosts |
    ForEach-Object {
      Write-Host "  - $_"
    }
}

Write-Section "RECENT RUNS" Cyan

$history |
  Select-Object -First $HistoryLimit |
  ForEach-Object {
    [PSCustomObject]@{
      GeneratedAt = $_.generatedAt
      Score       = $_.score
      Level       = $_.level

      Evidence =
        if ($null -ne $_.evidenceCorrelation) {
          $_.evidenceCorrelation.classification
        } else {
          "N/A"
        }

      Temporal =
        if ($null -ne $_.temporalCorrelation) {
          $_.temporalCorrelation.classification
        } else {
          "N/A"
        }

      ApiDrift =
        if (
          $null -ne
          $_.discovery.apiResponseDrift
        ) {
          $_.discovery.apiResponseDrift.detected
        } else {
          "N/A"
        }
    }
  } |
  Format-Table -AutoSize

Write-Section "LAST SIGNAL-BEARING RUN" Red

$lastInteresting =
  $history |
  Where-Object {
    $_.score -gt 0 -or
    (
      $null -ne $_.evidenceCorrelation -and
      $_.evidenceCorrelation.classification -notin @(
        $null,
        "NONE"
      )
    ) -or
    (
      $null -ne $_.temporalCorrelation -and
      $_.temporalCorrelation.classification -notin @(
        $null,
        "NONE"
      )
    ) -or
    (
      $null -ne
      $_.discovery.apiResponseDrift -and
      $_.discovery.apiResponseDrift.detected -eq $true
    )
  } |
  Select-Object -First 1

if ($null -eq $lastInteresting) {
  Write-Host "No signal-bearing run found in current history."
} else {
  [PSCustomObject]@{
    GeneratedAt =
      $lastInteresting.generatedAt

    Snapshot =
      $lastInteresting.snapshotId

    Score =
      $lastInteresting.score

    Alpha =
      "$($lastInteresting.alphaScore)/$($lastInteresting.alphaClass)"

    Evidence =
      Format-Nullable `
        $lastInteresting.evidenceCorrelation.classification `
        "N/A"

    EvidenceDomains =
      Format-Nullable `
        $lastInteresting.evidenceCorrelation.domainCount `
        "N/A"

    Temporal =
      Format-Nullable `
        $lastInteresting.temporalCorrelation.classification `
        "N/A"

    SpanMinutes =
      Format-Nullable `
        $lastInteresting.temporalCorrelation.spanMinutes `
        "N/A"

    ApiDrift =
      if (
        $null -eq
        $lastInteresting.discovery.apiResponseDrift.detected
      ) {
        "N/A"
      } else {
        $lastInteresting.discovery.apiResponseDrift.detected
      }
  } |
    Format-List
}
