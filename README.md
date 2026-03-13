# PResto

A terminal-based pull request dashboard. Discover PRs across repositories, check their status, and launch them in your favorite tools.

![PResto screenshot](docs/screenshot.png)

## Features

- **Multi-repo support** - Watch PRs across multiple repositories
- **Live status** - See CI checks, review status, and merge state at a glance
- **Fuzzy filtering** - Quickly find PRs by title, author, or repo
- **Preview panel** - View PR details, commits, and changed files inline
- **Command palette** - Quick access to all actions via `Ctrl-p`
- **Keyboard-driven** - Vim-style navigation throughout

## Installation

Requires [Bun](https://bun.sh) and [GitHub CLI](https://cli.github.com).

```bash
# Clone and install
git clone https://github.com/candril/presto.git
cd presto
bun install

# Run
bun run src/index.tsx
```

## Configuration

Create `~/.config/presto/config.toml`:

```toml
[repositories]
watched = [
  "owner/repo1",
  "owner/repo2",
]

[keys]
quit = "q"
refresh = "r"
open = "enter"
preview = "p"
```

## Keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate up/down |
| `g` / `G` | Jump to top/bottom |
| `Enter` | Open PR in browser |
| `o` | Open in riff |
| `p` | Toggle preview panel |
| `P` | Toggle preview position |
| `/` | Filter PRs |
| `Ctrl-p` | Command palette |
| `r` | Refresh |
| `?` | Help |
| `q` | Quit |

## Tech Stack

- [OpenTUI](https://github.com/anthropics/opentui) - Terminal UI framework
- [Bun](https://bun.sh) - JavaScript runtime
- [GitHub CLI](https://cli.github.com) - GitHub API access

## License

MIT
