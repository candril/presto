# Vision

**Status**: Ready

## Overview

presto is a terminal-based pull request discovery and management tool. Quickly find PRs across repositories, check their status, and launch them in your favorite tools (browser, riff, or any CLI tool).

## Core Principles

- **Fast discovery** - Instantly see PRs that need attention
- **Keyboard-driven** - Navigate and act without touching the mouse
- **Tool agnostic** - Open PRs in any tool you prefer
- **Minimal footprint** - Quick to launch, quick to dismiss

## Main Flows

### 1. PR Discovery

View PRs across configured repositories:
- PRs you authored
- PRs awaiting your review
- PRs from your team/org
- Recent PRs in watched repos

### 2. PR Inspection

Quickly check PR status:
- Title, author, age
- CI/CD check status (passing, failing, pending)
- Review status (approved, changes requested, pending)
- Comment count and activity

### 3. PR Actions

Act on PRs directly:
- Open in browser
- Open in riff for code review
- Open in custom tools
- Copy PR URL

## Data Source

Primary: GitHub via `gh` CLI

Future: GitLab, Bitbucket (out of scope for v1)

## Technology

- **UI**: OpenTUI React (`@opentui/react`)
- **GitHub**: `gh` CLI for API access
- **Runtime**: Bun
- **Config**: TOML file for preferences
