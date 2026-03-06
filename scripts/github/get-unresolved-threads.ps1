<#
.SYNOPSIS
    Retrieves unresolved review conversation threads from a GitHub pull request
    as structured JSON for agent consumption.

.DESCRIPTION
    GitHub MCP tools return ALL review threads (resolved and unresolved) with
    no server-side filter. On mature PRs this wastes significant agent context.
    This script fetches threads via GraphQL, filters client-side to unresolved
    only, and outputs minimal structured JSON to stdout.

    Companion script to resolve-pr-threads.ps1 — shares the same PATH
    self-healing and temp-file GraphQL patterns. PowerShell is justified here
    for consistency with that companion script and the established
    Invoke-GhGraphQL pattern that works around gh CLI quoting issues on Windows.

    Agents should call this script instead of MCP get_review_comments when the
    goal is to enumerate only unresolved findings (e.g., PR re-review workflows).

.PARAMETER PullNumber
    The pull request number to query.

.PARAMETER Owner
    GitHub organisation or user name. Defaults to "Cortexa-Labs".

.PARAMETER Repo
    GitHub repository name. Defaults to "monorepo".

.PARAMETER IncludeResolved
    When specified, includes ALL threads (resolved and unresolved) in output.
    Default behavior returns only unresolved threads.

.EXAMPLE
    .\get-unresolved-threads.ps1 -PullNumber 15

.EXAMPLE
    .\get-unresolved-threads.ps1 -PullNumber 15 | ConvertFrom-Json

.EXAMPLE
    .\get-unresolved-threads.ps1 -PullNumber 15 -IncludeResolved

.NOTES
    Prerequisites:
        - gh CLI must be installed and authenticated (gh auth login)
        - Install via: winget install --id GitHub.cli

    Output: JSON object to stdout with structure:
        {
          "pullNumber": 15,
          "owner": "Cortexa-Labs",
          "repo": "monorepo",
          "totalThreads": 42,
          "unresolvedCount": 2,
          "threads": [ { threadId, path, line, diffSide, isResolved, isOutdated, comments: [...] } ]
        }

    PATH NOTE (Windows / VS Code):
        VS Code captures the shell PATH at launch time. Changes to system or
        user PATH variables made after VS Code was opened are NOT inherited by
        integrated terminal sessions until VS Code is restarted.
        This script self-heals by probing known gh install locations and
        patching the session PATH automatically, so agents do not need to
        restart VS Code or manually set PATH.

    Runtime target: PowerShell Core (pwsh) v7+
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$PullNumber,

    [string]$Owner = "Cortexa-Labs",

    [string]$Repo = "monorepo",

    [switch]$IncludeResolved
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
    <#
    .SYNOPSIS
        Executes a GraphQL query via gh CLI using the temp-file pattern.
    .DESCRIPTION
        Uses a temp file to pipe the query payload into gh api graphql --input -
        to avoid PowerShell quoting issues when org names contain hyphens
        (e.g., "Cortexa-Labs") which gh misparses as flag arguments.
    #>
    param([Parameter(Mandatory)][string]$Query)

    $Payload = @{ query = $Query } | ConvertTo-Json -Compress
    Set-Content -Path $TempFile -Value $Payload -Encoding UTF8
    $Result = Get-Content -Path $TempFile -Encoding UTF8 | gh api graphql --input - 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "gh api graphql failed (exit $LASTEXITCODE): $Result"
    }
    return $Result | ConvertFrom-Json
}

# ---------------------------------------------------------------------------
# Fetch review threads with pagination support.
# GitHub limits reviewThreads to 100 per page. We page through using cursors.
# For comments within each thread, we fetch up to 25 (sufficient for most
# review conversations — threads rarely exceed a few exchanges).
# ---------------------------------------------------------------------------

Write-Host "Fetching review threads for PR #$PullNumber ($Owner/$Repo)..." -ForegroundColor Cyan

$AllThreadNodes = [System.Collections.Generic.List[object]]::new()
$HasNextPage = $true
$Cursor = $null

while ($HasNextPage) {
    $AfterClause = if ($Cursor) { ", after: `"$Cursor`"" } else { "" }

    $FetchQuery = @"
query {
  repository(owner: "$Owner", name: "$Repo") {
    pullRequest(number: $PullNumber) {
      reviewThreads(first: 100$AfterClause) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          comments(first: 25) {
            nodes {
              author { login }
              body
              createdAt
              url
            }
          }
        }
      }
    }
  }
}
"@ -replace "`r`n", " " -replace "`n", " "

    $Data = Invoke-GhGraphQL -Query $FetchQuery

    $PR = $Data.data.repository.pullRequest
    if (-not $PR) {
        Write-Error "PR #$PullNumber not found in $Owner/$Repo"
        exit 1
    }

    $PageThreads = @($PR.reviewThreads.nodes)
    foreach ($Thread in $PageThreads) {
        $AllThreadNodes.Add($Thread)
    }

    $PageInfo = $PR.reviewThreads.pageInfo
    $HasNextPage = $PageInfo.hasNextPage
    $Cursor = $PageInfo.endCursor

    if ($HasNextPage) {
        Write-Host "  Fetched $($AllThreadNodes.Count) threads so far, paging..." -ForegroundColor Gray
    }
}

$TotalCount = $AllThreadNodes.Count

# Filter to unresolved unless -IncludeResolved is set
if ($IncludeResolved) {
    $FilteredThreads = @($AllThreadNodes)
} else {
    $FilteredThreads = @($AllThreadNodes | Where-Object { -not $_.isResolved })
}

$UnresolvedCount = @($AllThreadNodes | Where-Object { -not $_.isResolved }).Count

Write-Host "  Total threads : $TotalCount" -ForegroundColor Gray
Write-Host "  Unresolved    : $UnresolvedCount" -ForegroundColor $(if ($UnresolvedCount -gt 0) { "Yellow" } else { "Green" })

# ---------------------------------------------------------------------------
# Build structured output for agent consumption.
# Status messages go to stderr (Write-Host); only the JSON goes to stdout.
# ---------------------------------------------------------------------------

$OutputThreads = [System.Collections.Generic.List[object]]::new()

foreach ($Thread in $FilteredThreads) {
    $Comments = [System.Collections.Generic.List[object]]::new()
    foreach ($Comment in @($Thread.comments.nodes)) {
        $Comments.Add(@{
            author    = if ($Comment.author) { $Comment.author.login } else { "ghost" }
            body      = $Comment.body
            createdAt = $Comment.createdAt
            url       = $Comment.url
        })
    }

    $OutputThreads.Add(@{
        threadId   = $Thread.id
        path       = $Thread.path
        line       = $Thread.line
        diffSide   = $Thread.diffSide
        isResolved = $Thread.isResolved
        isOutdated = $Thread.isOutdated
        comments   = $Comments
    })
}

$Output = @{
    pullNumber      = $PullNumber
    owner           = $Owner
    repo            = $Repo
    totalThreads    = $TotalCount
    unresolvedCount = $UnresolvedCount
    threads         = $OutputThreads
}

# Output JSON to stdout — this is the machine-readable payload for agents
$Output | ConvertTo-Json -Depth 10
