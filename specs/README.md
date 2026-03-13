# Specs

This directory contains feature specifications for presto.

## Format

Each spec follows a consistent structure:

- **Status**: `Draft` | `Ready` | `In Progress` | `Done`
- **Description**: What this feature does
- **Out of Scope**: What this feature explicitly does NOT do
- **Capabilities**: Prioritized list (P1 = MVP, P2 = Important, P3 = Nice to have)
- **Technical Notes**: Implementation details, code examples, file structure

## Naming

Specs are numbered sequentially: `NNN-feature-name.md`

## Workflow

1. Create spec as `Draft`
2. Review and refine -> `Ready`
3. Begin implementation -> `In Progress`
4. Complete and verified -> move to `done/` folder

## Current Specs

| # | Name | Status | Description |
|---|------|--------|-------------|
| 000 | [Vision](./000-vision.md) | Ready | Overall product vision and goals |
| 001 | [App Shell](./001-app-shell.md) | Done | Basic application shell with OpenTUI React |
| 002 | [PR List](./002-pr-list.md) | Done | Fetch and display list of PRs |
| 003 | [PR Detail](./003-pr-detail.md) | Ready | View PR details, checks, comments |
| 004 | [External Tools](./004-external-tools.md) | Ready | Open PRs in browser, riff, or other tools |
| 005 | [Smart Discovery](./005-smart-discovery.md) | Draft | Discovery bar with author/repo filters, starring, history |
| 006 | [Configuration](./006-configuration.md) | Done | Config file loading, repos, tools, keybindings |
| 007 | [Multi-Repo](./007-multi-repo.md) | Draft | Watch multiple repos, aggregate PRs |
| 008 | [Keyboard Shortcuts](./008-keyboard-shortcuts.md) | Draft | Help modal, vim navigation, configurable keys |
| 009 | [Auto-Refresh](./009-auto-refresh.md) | Draft | Periodic refresh, manual refresh, stale indicators |
| 010 | [Quick Actions](./010-quick-actions.md) | Draft | Popup menu for all available actions |
| 011 | [PR Tabs](./011-pr-tabs.md) | Draft | Tabs for My PRs, Reviews, Team, custom |

## MVP Path

The recommended implementation order for MVP:

1. **001 - App Shell** (P1) - Get the basic app running ✅
2. **002 - PR List** (P1) - Display PRs from GitHub
3. **003 - PR Detail** (P1) - Show PR info inline
4. **004 - External Tools** (P1) - Open in browser/riff
5. **005 - Smart Discovery** (P2) - Discovery bar with smart suggestions

## Post-MVP Features

6. **006 - Configuration** - Config file for customization
7. **007 - Multi-Repo** - Aggregate PRs across repos
8. **008 - Keyboard Shortcuts** - Help modal and vim keys
9. **009 - Auto-Refresh** - Keep data fresh
10. **010 - Quick Actions** - Discoverable action menu
11. **011 - PR Tabs** - Organized PR categories
