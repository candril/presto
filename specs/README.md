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
| 001 | [App Shell](./001-app-shell.md) | Ready | Basic application shell with OpenTUI React |
| 002 | [PR List](./002-pr-list.md) | Ready | Fetch and display list of PRs |
| 003 | [PR Detail](./003-pr-detail.md) | Ready | View PR details, checks, comments |
| 004 | [External Tools](./004-external-tools.md) | Ready | Open PRs in browser, riff, or other tools |
| 005 | [Search & Filter](./005-search-filter.md) | Ready | Filter PRs by status, author, repo |

## MVP Path

The recommended implementation order for MVP:

1. **001 - App Shell** (P1) - Get the basic app running
2. **002 - PR List** (P1) - Display PRs from GitHub
3. **003 - PR Detail** (P1) - Show PR info inline
4. **004 - External Tools** (P1) - Open in browser/riff
5. **005 - Search & Filter** (P2) - Filter and search PRs
