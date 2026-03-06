<#
.SYNOPSIS
    Resolves all open review conversation threads on a GitHub pull request.

.DESCRIPTION
    GitHub's "Resolve conversation" feature is GraphQL-only — it is not
    exposed via the REST API. This script uses `gh api graphql` with the
    resolveReviewThread mutation to mark all unresolved threads as resolved.

    The temp-file pattern is used for all GraphQL calls to avoid PowerShell
    quoting issues when the org name contains hyphens (e.g., "Cortexa-Labs")
    which `gh` misparses as flag arguments when passed via -f query=.

.PARAMETER PullNumber
    The pull request number to resolve threads on.

.PARAMETER Owner
    GitHub organisation or user name. Defaults to "Cortexa-Labs".

.PARAMETER Repo
    GitHub repository name. Defaults to "monorepo".

.PARAMETER DryRun
    When specified, fetches and lists all unresolved threads without
    resolving them.

.EXAMPLE
    .\resolve-pr-threads.ps1 -PullNumber 11

.EXAMPLE
    .\resolve-pr-threads.ps1 -PullNumber 11 -DryRun

.NOTES
    Prerequisites:
        - gh CLI must be installed and authenticated (gh auth login)
        - Install via: winget install --id GitHub.cli

    PATH NOTE (Windows / VS Code):
        VS Code captures the shell PATH at launch time. Changes to system or
        user PATH variables made after VS Code was opened are NOT inherited by
        integrated terminal sessions until VS Code is restarted.
        This script self-heals by probing known gh install locations and
        patching the session PATH automatically, so agents do not need to
        restart VS Code or manually set PATH.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PullNumber,

    [string]$Owner = "Cortexa-Labs",

    [string]$Repo = "monorepo",

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Self-heal PATH for gh CLI.
# VS Code captures the shell PATH at launch time. System/user PATH changes
# made after VS Code opened are NOT reflected in integrated terminal sessions
# until VS Code is restarted. We probe known install locations and patch the
# session PATH so agents never need to restart VS Code manually.
# ---------------------------------------------------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $GhCandidates = @(
        "C:\Program Files\GitHub CLI",
        "$env:LOCALAPPDATA\Programs\GitHub CLI",
        "$env:ProgramFiles(x86)\GitHub CLI"
    )
    $GhFound = $GhCandidates | Where-Object { Test-Path (Join-Path $_ "gh.exe") } | Select-Object -First 1
    if ($GhFound) {
        Write-Host "[PATH] gh not in session PATH. Adding: $GhFound" -ForegroundColor Yellow
        $env:PATH += ";$GhFound"
    } else {
        Write-Error "gh CLI not found. Install via: winget install --id GitHub.cli"
        exit 1
    }
}

$TempFile = Join-Path $env:TEMP "gh-gql.json"

function Invoke-GhGraphQL {
    param([string]$Query)
    # Use a temp file to avoid PowerShell quoting issues with hyphens in
    # org names being misinterpreted as flags by the gh CLI argument parser.
    $Payload = @{ query = $Query } | ConvertTo-Json -Compress
    Set-Content -Path $TempFile -Value $Payload -Encoding UTF8
    $Result = Get-Content $TempFile | gh api graphql --input - 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "gh api graphql failed: $Result"
    }
    return $Result | ConvertFrom-Json
}

# --- Step 1: Fetch all unresolved thread IDs ---

Write-Host "Fetching review threads for PR #$PullNumber ($Owner/$Repo)..." -ForegroundColor Cyan

$FetchQuery = @"
query {
  repository(owner: "$Owner", name: "$Repo") {
    pullRequest(number: $PullNumber) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
        }
      }
    }
  }
}
"@ -replace "`r`n", " " -replace "`n", " "

$Data = Invoke-GhGraphQL -Query $FetchQuery
# Coerce to array — Where-Object returns $null (not @()) when nothing matches,
# which causes 'Count' to throw under Set-StrictMode -Version Latest.
$AllThreads = @($Data.data.repository.pullRequest.reviewThreads.nodes)
$Unresolved = @($AllThreads | Where-Object { -not $_.isResolved })

Write-Host "  Total threads : $($AllThreads.Count)" -ForegroundColor Gray
Write-Host "  Unresolved    : $($Unresolved.Count)" -ForegroundColor $(if ($Unresolved.Count -gt 0) { "Yellow" } else { "Green" })

if ($Unresolved.Count -eq 0) {
    Write-Host "All threads are already resolved. Nothing to do." -ForegroundColor Green
    exit 0
}

if ($DryRun) {
    Write-Host "`nDry run - threads that would be resolved:" -ForegroundColor Yellow
    $Unresolved | ForEach-Object { Write-Host "  $($_.id)" -ForegroundColor Gray }
    exit 0
}

# --- Step 2: Resolve each unresolved thread ---

Write-Host "`nResolving threads..." -ForegroundColor Cyan

$Resolved = 0
$Failed = 0

foreach ($Thread in $Unresolved) {
    $MutationQuery = "mutation { resolveReviewThread(input: {threadId: `"$($Thread.id)`"}) { thread { id isResolved } } }"
    try {
        $Result = Invoke-GhGraphQL -Query $MutationQuery
        $IsNowResolved = $Result.data.resolveReviewThread.thread.isResolved
        if ($IsNowResolved) {
            Write-Host "  [OK] $($Thread.id)" -ForegroundColor Green
            $Resolved++
        } else {
            Write-Host "  [FAIL] $($Thread.id) - isResolved still false" -ForegroundColor Red
            $Failed++
        }
    } catch {
        Write-Host "  [ERROR] $($Thread.id) - $_" -ForegroundColor Red
        $Failed++
    }
}

# --- Step 3: Summary ---

Write-Host ""
if ($Failed -eq 0) {
    Write-Host "Done. $Resolved thread(s) resolved successfully." -ForegroundColor Green
} else {
    Write-Host "Completed with errors. Resolved: $Resolved  Failed: $Failed" -ForegroundColor Yellow
    exit 1
}
