# CI Patrol

CI Patrol monitors CircleCI runs for the GiveCampus repo, automatically distinguishes flaky test failures from legitimate ones using Claude, and reruns flaky jobs without engineer intervention. When CI passes or fails for real, it notifies the engineer via Slack DM.

## The Problem

GiveCampus CI has aggressive parallelization (32 nodes for unit specs, 50 for feature specs) and rspec-retry (3 attempts), but flaky failures still get through. Engineers waste time manually checking whether a failure is flaky, re-triggering CI, and waiting again. CI Patrol automates this loop.

## How It Works

1. **Dashboard** shows your open PRs with CI status, approval count, and a monitoring toggle
2. **Toggle monitoring on** for a branch to start watching it
3. When CI **fails**, CI Patrol pulls the test output and PR diff, sends them to Claude for analysis
4. Claude classifies the failure as **flaky** (infrastructure/timing), **legitimate** (related to your code changes), or **unclear**
5. If **flaky**: automatically reruns the failed jobs via CircleCI API (up to a configurable max)
6. If **legitimate** or **unclear**: sends a Slack DM with the verdict and reasoning
7. When CI **passes**: sends a Slack DM confirming success

The max number of automatic reruns is configurable per PR (default 2, range 1-5).

## Tech Stack

- **Next.js** (App Router) with TypeScript and Tailwind CSS
- **SQLite** via Prisma for persistence
- **Claude Code CLI** (`claude -p`) for failure analysis (uses your existing subscription)
- **CircleCI API v2** for pipeline monitoring and job reruns
- **GitHub CLI** (`gh`) for authentication and PR data
- **Slack Web API** for DM notifications

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (`gh auth login`)
- [Claude Code](https://claude.ai/code) installed and authenticated
- A CircleCI personal API token
- (Optional) A Slack bot token for DM notifications

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.local.example .env.local

# Push the database schema
npm run db:push

# Start the dev server
npm run dev
```

The app runs on **http://localhost:3737** (port 3737 to avoid conflicting with the Rails dev server on 3000).

## Environment Variables

Create a `.env.local` file:

```bash
# GitHub (uses `gh` CLI for auth — no credentials needed)
GITHUB_ORG=givecampus
GITHUB_REPO=givecampus

# CircleCI
CIRCLECI_TOKEN=           # Personal API token from CircleCI > User Settings > Personal API Tokens
CIRCLECI_PROJECT_SLUG=gh/givecampus/givecampus

# Slack (optional — without this, notifications log to console)
SLACK_BOT_TOKEN=          # xoxb-... bot token with chat:write scope

# App
SESSION_SECRET=           # Random string (openssl rand -base64 32)
POLL_SECRET=              # Random string (openssl rand -base64 32)
NEXT_PUBLIC_APP_URL=http://localhost:3737
DATABASE_URL=file:./dev.db
```

## How Monitoring Works

The monitoring loop runs inside the `/api/prs` request, which the dashboard polls every 15 seconds via SWR. On each cycle:

1. Fetches the latest CircleCI pipeline for each monitored branch
2. Compares against stored state to detect changes
3. On failure: calls Claude Code to analyze, then reruns or notifies
4. On success: sends a pass notification
5. Tracks rerun count to enforce the per-monitor max

When a workflow is rerun from failed, CircleCI creates a new workflow under the same pipeline. CI Patrol handles this by only looking at the most recent run of each workflow name.

## Claude Analysis

Claude receives:
- The failed test names and error output
- The PR diff
- Context about the CI environment (rspec-retry, Capybara/Ferrum, parallelism)

It classifies each failed test individually, then rolls up to an overall verdict. If ANY test is classified as legitimate, the overall verdict is legitimate — we only auto-rerun when ALL failures appear unrelated to code changes.

## Branches

- **main** — Uses Claude Code CLI (`claude -p`) for analysis. No API key needed.
- **claude-api-version** — Uses the Anthropic SDK with `ANTHROPIC_API_KEY`. Faster but costs ~$0.06/analysis.

## Project Structure

```
src/
  app/
    page.tsx                    # PR dashboard
    history/page.tsx            # Analysis history
    api/
      auth/me/route.ts          # Current user (from gh CLI)
      prs/route.ts              # Open PRs + CI status + poll cycle
      monitors/route.ts         # Monitor CRUD
      monitors/[id]/route.ts    # Monitor update/delete
      analyses/route.ts         # Analysis history
      poll/route.ts             # Manual poll trigger
  components/
    PRRow.tsx                   # PR row with status, approvals, toggle
    StatusBadge.tsx             # CI status indicator
    MonitorToggle.tsx           # Enable/disable monitoring + max reruns
    AnalysisCard.tsx            # Analysis verdict display
    Nav.tsx                     # Top navigation
  lib/
    circleci.ts                 # CircleCI API v2 client
    github.ts                   # GitHub data via gh CLI
    claude.ts                   # Claude Code CLI for failure analysis
    slack.ts                    # Slack DM notifications
    monitor.ts                  # Core monitoring state machine
    auth.ts                     # User detection from gh CLI
    db.ts                       # Prisma client singleton
    hooks.ts                    # React hooks (useUser)
prisma/
  schema.prisma                 # Database schema (User, Monitor, Analysis, Notification)
```
