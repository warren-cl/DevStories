We've completed a code review and we need to consider the recommendations.

If we agree to make changes, make them with the long-term in mind. DON'T implement quick fixes. We are building a serious, secure banking application that is intended to be maintained and enhanced over a long period of time.

Avoid creating technical debt and be sure to refactor code as needed to keep the codebase clean and maintainable.

When you find very large monolithic functions or classes, break them down into smaller, more manageable pieces if time allows or if the effort and testing is significant, raise this as a technical debt item to be addressed in the near future.

Write clean, maintainable, well-documented code that follows best practices and coding standards.

Take an iterative approach to making changes. Build the code in small increments and test each increment to make sure it meets the requirements.

Don't write more automated tests yet, once made the changes, we will decide what to do about testing.

After making any changes run the existing test suite to ensure nothing else is broken.

## Before Writing Any Code — Extract a Finding Checklist

Before touching a single file, extract **every** unresolved finding from
**every** reviewer into a numbered checklist. Work through items one at a
time and tick each off only when the fix is committed and tested. Do not
declare a review session complete until every item is explicitly checked.

```
[ ] Reviewer: <name> — <file> — <finding summary>
[ ] Reviewer: <name> — <file> — <finding summary>
...
```

**Why:** Reviews that are read once and addressed from memory routinely miss
findings — especially when multiple reviewers contribute in different
sessions or the review is long.

### Loading Unresolved Findings

GitHub APIs have no server-side filter for unresolved review threads. The
MCP `get_review_comments` tool returns ALL threads — resolved and
unresolved — which wastes context budget on mature PRs with many
already-resolved conversations.

**You MUST use the following script** to load only unresolved threads
before building your checklist:

```powershell
.\scripts\github\get-unresolved-threads.ps1 -PullNumber <N>
```

This fetches threads via GraphQL, filters client-side, and returns only
unresolved threads as structured JSON to stdout. Status messages go to
stderr. Build your finding checklist from this output.

**Fallback (only if the script is unavailable):** Use the MCP
`pull_request_read` tool with `get_review_comments` method and manually
filter to `is_resolved: false` threads. Do NOT build the checklist from
the full unfiltered thread list.

### Load Failed PR Checks

Failed PR checks are CI-level findings and carry equal weight to reviewer
comments. You MUST resolve all failed checks before re-committing.

**Use the retrieval script** to get structured failure details:

```powershell
.\scripts\github\get-failed-pr-checks.ps1 -PullNumber <N>
```

This outputs JSON to stdout with check summary + filtered error logs.
Add each failure to your finding checklist:

```
[ ] CI: <job-name> — <root cause from error lines>
```

**Edge cases:**

- If CI hasn't run yet (new push, checks pending), the script returns
  `failedCount: 0` with a status message. Wait and retry.
- Use `-IncludePassing` to see all checks (useful for understanding which
  jobs were skipped vs passed).
- Use `-RawLogs` for full unfiltered failure output when the filtered
  summary is insufficient for diagnosis.

**Manual fallback** (only if the script is unavailable):

```powershell
# Step 1: Check overview — which checks failed?
gh pr checks <N>

# Step 2: Find the workflow run ID
gh run list --json "databaseId,status,conclusion,headBranch,event" `
  | ConvertFrom-Json `
  | Where-Object { $_.headBranch -eq '<branch-name>' } `
  | Select-Object -First 1

# Step 3: Extract filtered error lines from failed logs
gh run view <RUN_ID> --log-failed `
  | Select-String -Pattern '(##\[error\]|exit code \d+|command not found|ERR_PNPM_|Missing script:|vulnerabilit(y|ies) found|FAIL |Cannot find module|fatal:)' `
  | ForEach-Object { $_.Line.Trim() }
```

**Common root cause patterns** (learned from PR #19, 2026-03-05):

| Error Signal                    | Root Cause                              | Fix Pattern                                      |
| ------------------------------- | --------------------------------------- | ------------------------------------------------ |
| `exit code 127` + `not found`   | Command not on CI PATH                  | Use `pnpm exec <tool>` or `pnpm run <script>`   |
| `ERR_PNPM_NO_SCRIPT`            | Missing script alias in package.json    | Add the script to root `package.json` scripts    |
| `N vulnerabilities found`        | SCA audit found high-severity deps      | Add `pnpm.overrides` in package.json, re-install |
| `Cannot find module`             | Missing dependency or wrong import path | Check `pnpm install` and import aliases          |
| `FAIL src/...` + `TypeError`    | Application test failure                | Debug the test or underlying code                |

## One Fix, One Lint, One Test Run

After **each individual fix**, run lint then tests — never batch fixes.
**Lint first, always.** Lint catches syntax errors, irregular whitespace,
and import violations in seconds; running a full test suite only to fail on
a lint issue wastes minutes.

Only move to the next checklist item once **both** lint and tests are green.
If a fix introduces a new failure, address it before proceeding — never
carry forward a broken baseline.

**Why:** Batching fixes before running tests conflates cause and effect.
Running tests before lint is even worse: a stray invisible character or
unclosed comment can cascade into confusing test failures that waste
investigation time (see PITFALLS.md #41, #42).

## Resolving GitHub Review Conversations

After fixes are committed, all open review conversation threads on the PR
must be marked resolved. Follow these rules exactly — learned the hard way.

### Key constraints (know these upfront)

1. **GraphQL-only** — GitHub's "Resolve conversation" is not on the REST
   API. It requires the `resolveReviewThread` GraphQL mutation. The MCP
   `get_review_comments` tool returns REST comment data (database IDs), not
   the GraphQL thread node IDs (`PRRT_*`) needed for resolution. Do not
   attempt REST-based resolution.

2. **`gh` CLI required** — Use `gh api graphql`. If there are errors, verify availability first:

   ```powershell
   gh --version
   ```

   If not found: STOP and escalate.

3. **PowerShell quoting trap** — Never use `gh api graphql -f query='...'`
   in PowerShell when the org name contains hyphens (e.g., `Cortexa-Labs`).
   The hyphen causes `gh` to misparse the argument as a flag. Always use the
   temp-file pattern: write `{"query":"..."}` JSON to a temp file and pipe
   via `--input -`.

### Use the resolve script

A reusable script encapsulates all of the above:

```powershell
# Resolve all open threads on PR #11
.\scripts\github\resolve-pr-threads.ps1 -PullNumber 11

# Preview without resolving
.\scripts\github\resolve-pr-threads.ps1 -PullNumber 11 -DryRun
```

### Manual two-step process (if script unavailable)

**Step 1 — Fetch thread node IDs:**

```powershell
$json = '{"query":"query { repository(owner: \"Cortexa-Labs\", name: \"monorepo\") { pullRequest(number: 11) { reviewThreads(first: 100) { nodes { id isResolved } } } } }"}'
Set-Content "$env:TEMP\gql.json" $json -Encoding UTF8
Get-Content "$env:TEMP\gql.json" | gh api graphql --input -
```

**Step 2 — Resolve each thread** (loop over the `PRRT_*` IDs returned):

```powershell
$id = "PRRT_kwDOQmhZ3s5x..."
$json = "{`"query`":`"mutation { resolveReviewThread(input: {threadId: \`"$id\`"}) { thread { id isResolved } } }`"}"
Set-Content "$env:TEMP\gql.json" $json -Encoding UTF8
Get-Content "$env:TEMP\gql.json" | gh api graphql --input -
```

---

Please look at this and let me have your thoughts:
