<#
.SYNOPSIS
    Retrieves failed PR check details and error logs from a GitHub pull request
    as structured JSON for agent consumption.

.DESCRIPTION
    Diagnosing failed PR checks manually requires multiple gh CLI calls and
    filtering through large (100KB+) raw CI logs to find root causes. This
    script automates the three-step process:

    1. gh pr checks <N>          -- overview of all checks and their status
    2. gh run list               -- find the workflow run ID for the PR
    3. gh run view --log-failed  -- extract only error/failure lines

    The output is structured JSON containing the check summary and filtered
    failure details, ready for agent consumption with minimal context cost.

    Companion script to get-unresolved-threads.ps1 -- shares the same PATH
    self-healing patterns. PowerShell is justified for consistency with the
    established GitHub script patterns in this directory.

.PARAMETER PullNumber
    The pull request number to query.

.PARAMETER Owner
    GitHub organisation or user name. If omitted, read from GH_OWNER or
    the owner portion of GITHUB_REPOSITORY ("owner/repo" format).
    One of these must be available — the parameter is mandatory if no
    environment variable is set.

.PARAMETER Repo
    GitHub repository name. If omitted, read from GH_REPO or the repo
    portion of GITHUB_REPOSITORY ("owner/repo" format).
    One of these must be available — the parameter is mandatory if no
    environment variable is set.

.PARAMETER IncludePassing
    When specified, includes passing checks in the summary output.
    Default behavior returns only failed checks.

.PARAMETER RawLogs
    When specified, outputs the full unfiltered failure logs instead of
    the filtered error summary. Use for deep investigation when the
    filtered output is insufficient.

.EXAMPLE
    # Explicit owner/repo
    .\get-failed-pr-checks.ps1 -PullNumber 19 -Owner my-org -Repo my-repo

.EXAMPLE
    # Resolve owner/repo from GITHUB_REPOSITORY env var (e.g. in GitHub Actions)
    $env:GITHUB_REPOSITORY = 'my-org/my-repo'
    .\get-failed-pr-checks.ps1 -PullNumber 19 | ConvertFrom-Json

.EXAMPLE
    .\get-failed-pr-checks.ps1 -PullNumber 19 -Owner my-org -Repo my-repo -IncludePassing

.NOTES
    Prerequisites:
        - gh CLI must be installed and authenticated (gh auth login)
        - Install via: winget install --id GitHub.cli

    Output: JSON object to stdout with structure:
        {
          "pullNumber": 19,
          "owner": "Cortexa-Labs",
          "repo": "monorepo",
          "totalChecks": 16,
          "failedCount": 5,
          "passedCount": 5,
          "skippedCount": 6,
          "checks": [
            {
              "name": "PR Checks / Frontend Linting (pull_request)",
              "status": "fail",
              "elapsed": "53s"
            }
          ],
          "failureDetails": [
            {
              "job": "Frontend Linting",
              "errors": [
                "line 1: nx: command not found",
                "Process completed with exit code 127."
              ]
            }
          ],
          "runId": 22703237977
        }

    Error patterns extracted (tuned from real PR #19 diagnosis, 2026-03-05):
        - ##[error] annotations from GitHub Actions
        - Exit code lines
        - "command not found" messages
        - Vulnerability count summaries
        - Missing script errors (ERR_PNPM_NO_SCRIPT)
        - Build/compilation failures
        - Test failure summaries
#>

# PSReviewUnusedParameter: $IncludePassing and $RawLogs are used inside nested
# functions (Get-CheckOverview, Get-FailureDetails). PSScriptAnalyzer does not
# track cross-function parameter references from the top-level param block.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
    'PSReviewUnusedParameter', 'IncludePassing',
    Justification = 'Used inside nested function Get-CheckOverview via script scope')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
    'PSReviewUnusedParameter', 'RawLogs',
    Justification = 'Used inside nested function Get-FailureDetails via script scope')]
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PullNumber,

    [string]$Owner,
    [string]$Repo,

    [switch]$IncludePassing,
    [switch]$RawLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --------------------------------------------------------------------------
# Resolve Owner / Repo from environment when not supplied on the command line.
# Priority: explicit param > GH_OWNER/GH_REPO > GITHUB_REPOSITORY ("owner/repo").
# --------------------------------------------------------------------------
if (-not $Owner) { $Owner = $env:GH_OWNER }
if (-not $Repo)  { $Repo  = $env:GH_REPO  }

if ((-not $Owner -or -not $Repo) -and $env:GITHUB_REPOSITORY) {
    $GhRepoParts = $env:GITHUB_REPOSITORY -split '/', 2
    if (-not $Owner -and $GhRepoParts.Count -ge 1) { $Owner = $GhRepoParts[0] }
    if (-not $Repo  -and $GhRepoParts.Count -ge 2) { $Repo  = $GhRepoParts[1] }
}

if (-not $Owner) {
    Write-Error "Owner is required. Provide -Owner, or set the GH_OWNER or GITHUB_REPOSITORY environment variable."
    exit 1
}
if (-not $Repo) {
    Write-Error "Repo is required. Provide -Repo, or set the GH_REPO or GITHUB_REPOSITORY environment variable."
    exit 1
}

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

function Write-Status {
    param([string]$Message)
    [Console]::Error.WriteLine($Message)
}

function Assert-GhCli {
    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCmd) {
        Write-Status 'ERROR: gh CLI not found. Install via: winget install --id GitHub.cli'
        exit 2
    }
}

# --------------------------------------------------------------------------
# Step 1: Get check overview via gh pr checks
# --------------------------------------------------------------------------

function Get-CheckOverview {
    Write-Status "Fetching PR #$PullNumber check status..."

    # gh pr checks outputs tab-separated: NAME STATUS ELAPSED URL
    # It writes to stderr and exits non-zero when no checks exist or all fail.
    # We need to capture both stdout and stderr and handle gracefully.
    $raw = $null
    try {
        $raw = gh pr checks $PullNumber --repo "${Owner}/${Repo}" 2>&1
    }
    catch {
        $null = $_ # Swallow — $raw will contain the error record when gh exits non-zero
    }

    # Handle "no checks reported" (CI run hasn't started yet)
    $rawText = ($raw | Out-String)
    if ($rawText -match 'no checks reported') {
        Write-Status "No checks reported yet on this PR. The CI run may still be pending."
        return @{
            totalChecks  = 0
            failedCount  = 0
            passedCount  = 0
            skippedCount = 0
            pendingCount = 0
            checks       = @()
            noneReported = $true
        }
    }

    $checks = @()
    $failed = 0
    $passed = 0
    $skipped = 0
    $pending = 0

    foreach ($line in $raw) {
        $text = $line.ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($text)) { continue }
        # Skip summary lines like "Some checks were not successful" or "0 cancelled..."
        if ($text -match '^(Some checks|All checks|\d+ cancelled)') { continue }

        # Parse: status indicator (X, check, -, *) then name, then optional elapsed + URL
        if ($text -match '^(X|-)?\s+(.+?)\s{2,}(\S*)\s+https://') {
            $statusChar = $Matches[1]
            $name = $Matches[2].Trim()
            $elapsed = $Matches[3].Trim()

            $status = switch ($statusChar) {
                'X'  { $failed++;  'fail' }
                '-'  { $skipped++; 'skipped' }
                '*'  { $pending++; 'pending' }
                default { $passed++; 'pass' }
            }

            $checks += @{
                name    = $name
                status  = $status
                elapsed = $elapsed
            }
        }
        elseif ($text -match '^\s+(.+?)\s{2,}(\S*)\s+https://') {
            # Lines without a status prefix (passed checks show a checkmark
            # which may be stripped)
            $name = $Matches[1].Trim()
            $elapsed = $Matches[2].Trim()
            $passed++
            $checks += @{
                name    = $name
                status  = 'pass'
                elapsed = $elapsed
            }
        }
    }

    if (-not $IncludePassing) {
        $checks = $checks | Where-Object { $_.status -ne 'pass' -and $_.status -ne 'skipped' }
    }

    return @{
        totalChecks  = $failed + $passed + $skipped + $pending
        failedCount  = $failed
        passedCount  = $passed
        skippedCount = $skipped
        pendingCount = $pending
        checks       = $checks
    }
}

# --------------------------------------------------------------------------
# Step 2: Find the workflow run ID for this PR
# --------------------------------------------------------------------------

function Get-RunId {
    Write-Status "Finding workflow run ID for PR #$PullNumber..."

    # Get the PR head branch to match against runs
    $prJson = gh pr view $PullNumber --repo "${Owner}/${Repo}" --json headRefName 2>&1
    $prData = $prJson | ConvertFrom-Json
    $branch = $prData.headRefName

    Write-Status "  PR branch: $branch"

    # Find the most recent run on this branch
    $runsJson = gh run list --repo "${Owner}/${Repo}" --branch $branch --limit 5 --json 'databaseId,status,conclusion,event' 2>&1
    $runs = $runsJson | ConvertFrom-Json

    if ($runs.Count -eq 0) {
        Write-Status 'WARNING: No workflow runs found for this PR branch.'
        return $null
    }

    # Prefer the most recent pull_request event run
    $prRun = $runs | Where-Object { $_.event -eq 'pull_request' } | Select-Object -First 1
    if ($prRun) {
        Write-Status "  Run ID: $($prRun.databaseId) (status: $($prRun.conclusion))"
        return $prRun.databaseId
    }

    # Fallback to most recent run of any type
    $firstRun = $runs | Select-Object -First 1
    Write-Status "  Run ID: $($firstRun.databaseId) (status: $($firstRun.conclusion), event: $($firstRun.event))"
    return $firstRun.databaseId
}

# --------------------------------------------------------------------------
# Step 3: Extract failure details from run logs
# --------------------------------------------------------------------------

function Get-FailureDetails {
    param([long]$RunId)

    Write-Status "Fetching failure logs for run $RunId..."

    $rawLogs = gh run view $RunId --repo "${Owner}/${Repo}" --log-failed 2>&1 | Out-String

    if ($RawLogs) {
        return @(@{
            job    = '_raw_logs'
            errors = @($rawLogs -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        })
    }

    # Error-extraction patterns (tuned from real PR #19 diagnosis, 2026-03-05)
    #
    # These patterns capture the root cause lines from GitHub Actions logs
    # while filtering out the 99%+ of setup/progress noise.
    $errorPatterns = @(
        '##\[error\]',                          # GitHub Actions error annotations
        'exit code \d+',                        # Process exit codes
        'command not found',                    # Missing binary on PATH
        'ERR_PNPM_',                            # pnpm-specific errors
        'Missing script:',                      # Missing package.json scripts
        'vulnerabilit(y|ies) found',            # pnpm audit summary
        'FAIL(ED)?[\s:]',                       # Test failure summaries
        'Error:.*failed',                       # Generic error lines
        'Cannot find module',                   # Node module resolution
        'ModuleNotFoundError',                  # Python import errors
        'SyntaxError',                          # Parse errors
        'TypeError',                            # Runtime type errors
        'fatal:',                               # Git fatal errors
        'Command ".*" not found',               # pnpm command not found
        'Did you mean'                          # pnpm suggestion (context for missing script)
    )

    $combinedPattern = ($errorPatterns -join '|')

    # Extract matching lines grouped by job name
    $jobErrors = @{}
    foreach ($line in ($rawLogs -split "`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }

        # Log lines are formatted: "JobName\tSTEP\tTimestamp Message"
        if ($trimmed -match $combinedPattern) {
            # Extract job name from the tab-delimited prefix
            $jobName = 'Unknown'
            if ($trimmed -match '^(.+?)\s{2,}UNKNOWN STEP\s') {
                $jobName = $Matches[1].Trim()
            }
            elseif ($trimmed -match '^(.+?)\t') {
                $jobName = $Matches[1].Trim()
            }

            # Strip the timestamp prefix for cleaner output
            $message = $trimmed
            if ($message -match '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*(.+)$') {
                $message = $Matches[1].Trim()
            }

            if (-not $jobErrors.ContainsKey($jobName)) {
                $jobErrors[$jobName] = [System.Collections.Generic.List[string]]::new()
            }
            # Deduplicate identical messages within a job
            if (-not $jobErrors[$jobName].Contains($message)) {
                $jobErrors[$jobName].Add($message)
            }
        }
    }

    # Convert to array of objects
    $details = @()
    foreach ($job in ($jobErrors.Keys | Sort-Object)) {
        $details += @{
            job    = $job
            errors = @($jobErrors[$job])
        }
    }

    return $details
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

Assert-GhCli

$overview = Get-CheckOverview

if ($overview.ContainsKey('noneReported') -and $overview.noneReported) {
    $result = @{
        pullNumber     = $PullNumber
        owner          = $Owner
        repo           = $Repo
        totalChecks    = 0
        failedCount    = 0
        passedCount    = 0
        skippedCount   = 0
        checks         = @()
        failureDetails = @()
        runId          = $null
        message        = 'No checks reported yet. CI run may still be pending.'
    }
    $result | ConvertTo-Json -Depth 5
    exit 0
}

if ($overview.failedCount -eq 0) {
    Write-Status "All PR checks passed. No failures to report."
    $result = @{
        pullNumber     = $PullNumber
        owner          = $Owner
        repo           = $Repo
        totalChecks    = $overview.totalChecks
        failedCount    = 0
        passedCount    = $overview.passedCount
        skippedCount   = $overview.skippedCount
        checks         = @()
        failureDetails = @()
        runId          = $null
    }
    $result | ConvertTo-Json -Depth 5
    exit 0
}

Write-Status "$($overview.failedCount) failed check(s) found."

$runId = Get-RunId
$failureDetails = @()

if ($runId) {
    $failureDetails = Get-FailureDetails -RunId $runId
}

$result = @{
    pullNumber     = $PullNumber
    owner          = $Owner
    repo           = $Repo
    totalChecks    = $overview.totalChecks
    failedCount    = $overview.failedCount
    passedCount    = $overview.passedCount
    skippedCount   = $overview.skippedCount
    checks         = @($overview.checks)
    failureDetails = @($failureDetails)
    runId          = $runId
}

$result | ConvertTo-Json -Depth 5
exit 0
