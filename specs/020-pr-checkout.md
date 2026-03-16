# PR Checkout

**Status**: Done

## Description

Checkout a PR locally to work on it in your development environment. Uses local repo mappings from riff config or a base folder to find the local clone, then runs `gh pr checkout`. Available via Space or command palette.

## Out of Scope

- Cloning repos that don't exist locally
- Branch management after checkout
- Automatic pull/rebase before checkout

## Capabilities

### P1 - Must Have

- **Checkout action**: Space or command palette entry to checkout current PR
- **Riff config integration**: Read `~/.config/riff/config.toml` for `[storage.repos]` mappings
- **Base folder fallback**: Use configured `basePath` (e.g., `~/Development`) to find repos
- **User alert**: Show message when no local path can be found
- **Execute checkout**: Run `gh pr checkout {number}` in the local repo directory

### P2 - Should Have

- **Per-repo local path config**: Add optional `localPath` to presto's repository config
- **Success feedback**: Show "Checked out #123 to branch-name" message

### P3 - Nice to Have

- **Open in editor**: Option to open editor after checkout
- **Remember last checkout**: Track recently checked out PRs

## Configuration

### Presto Config Extension

```toml
# ~/.config/presto/config.toml

# Global base path for finding repos (overrides riff config)
[paths]
basePath = "~/Development"

# Per-repo local path
[[repositories]]
name = "owner/repo"
localPath = "~/Development/repo"
```

### Riff Config Integration

Read from `~/.config/riff/config.toml`:

```toml
[storage]
basePath = "~/code"

[storage.repos]
"owner/repo" = "/path/to/local/clone"
```

## Path Resolution Order

1. **Presto repo config**: `repositories[].localPath` for this repo
2. **Riff explicit mapping**: `storage.repos["owner/repo"]`
3. **Presto base path**: `paths.basePath` + repo name (e.g., `~/Development/repo`)
4. **Riff base path**: `storage.basePath` + repo name (e.g., `~/code/repo`)
5. **Not found**: Show alert message

## Technical Notes

### Riff Config Schema

```typescript
// src/config/riff.ts
export interface RiffConfig {
  storage?: {
    basePath?: string
    repos?: Record<string, string>  // "owner/repo" -> "/local/path"
  }
}

export function loadRiffConfig(): RiffConfig | null {
  const configPath = join(homedir(), ".config", "riff", "config.toml")
  if (!existsSync(configPath)) return null
  
  const content = readFileSync(configPath, "utf-8")
  return parse(content) as RiffConfig
}
```

### Path Resolution

```typescript
// src/actions/checkout.ts
import { $ } from "bun"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { PR, Config } from "../types"
import { getRepoName } from "../types"
import { loadRiffConfig } from "../config/riff"

/** Expand ~ to home directory */
function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2))
  }
  return path
}

/** Find local path for a repository */
export function findLocalPath(
  repoName: string,
  config: Config
): string | null {
  const repoShortName = repoName.split("/")[1]
  
  // 1. Check presto per-repo config
  const repoConfig = config.repositories.find(r => r.name === repoName)
  if (repoConfig?.localPath) {
    const path = expandHome(repoConfig.localPath)
    if (existsSync(path)) return path
  }
  
  // 2. Check riff explicit mapping
  const riffConfig = loadRiffConfig()
  if (riffConfig?.storage?.repos?.[repoName]) {
    const path = expandHome(riffConfig.storage.repos[repoName])
    if (existsSync(path)) return path
  }
  
  // 3. Check presto base path
  if (config.paths?.basePath) {
    const path = join(expandHome(config.paths.basePath), repoShortName)
    if (existsSync(path)) return path
  }
  
  // 4. Check riff base path
  if (riffConfig?.storage?.basePath) {
    const path = join(expandHome(riffConfig.storage.basePath), repoShortName)
    if (existsSync(path)) return path
  }
  
  return null
}

/** Checkout a PR locally */
export async function checkoutPR(
  pr: PR,
  config: Config
): Promise<{ success: boolean; message: string; branch?: string }> {
  const repoName = getRepoName(pr)
  const localPath = findLocalPath(repoName, config)
  
  if (!localPath) {
    return {
      success: false,
      message: `No local path found for ${repoName}. Configure paths.basePath or repository localPath.`,
    }
  }
  
  try {
    // Run checkout in the repo directory
    const result = await $`gh pr checkout ${pr.number} -R ${repoName}`
      .cwd(localPath)
      .text()
    
    // Extract branch name from output
    const branchMatch = result.match(/Switched to branch '([^']+)'/)
    const branch = branchMatch?.[1] ?? `pr-${pr.number}`
    
    return {
      success: true,
      message: `Checked out #${pr.number} in ${localPath}`,
      branch,
    }
  } catch (err) {
    return {
      success: false,
      message: `Checkout failed: ${err}`,
    }
  }
}
```

### Command Definition

```typescript
// In src/commands/definitions.ts
{
  id: "action.checkout",
  label: "Checkout PR locally",
  category: "action",
  shortcut: "Space",
  requiresPR: true,
  execute: async (ctx) => {
    const result = await checkoutPR(ctx.selectedPR!, ctx.config)
    return {
      type: result.success ? "success" : "error",
      message: result.message,
    }
  },
},
```

### Keyboard Binding

```typescript
// In useKeyboardNav.ts
if (key.name === "space" && selectedPR) {
  const result = await checkoutPR(selectedPR, config)
  dispatch({ type: "SHOW_MESSAGE", message: result.message })
  return
}
```

## File Structure

```
src/
├── config/
│   ├── schema.ts          # Add paths.basePath, repository.localPath
│   ├── loader.ts          # Parse new config fields
│   └── riff.ts            # NEW: Load riff config
├── actions/
│   ├── tools.ts           # Existing browser/riff/copy
│   └── checkout.ts        # NEW: Checkout implementation
├── commands/
│   └── definitions.ts     # Add checkout command
└── hooks/
    └── useKeyboardNav.ts  # Add Space handler
```
