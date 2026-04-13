# Copy branch name

**Status**: Draft

## Description

Add a command-palette action and keybinding to copy the selected PR's head branch name (`headRefName`) to the system clipboard. Mirrors the existing `Copy URL` / `Copy PR number` pattern.

## Out of Scope

- Copying the base branch name
- Copying remote-qualified refs (e.g. `origin/feature-x`)
- Customizable copy formats (e.g. `<repo>:<branch>`)

## Capabilities

### P1 - Must Have

- **Command palette entry**: `Copy branch name` under `action` category, `requiresPR: true`, shortcut shown as `b`.
- **Keybinding `b`**: Copy `selectedPR.headRefName` to clipboard via `pbcopy` (already used by existing copy actions).
- **Status message**: `Copied <branch-name>` on success, `No branch name available` if `headRefName` is `null` (e.g. fork deleted).

### P2 - Should Have

- **Help overlay row** under "Actions": `b — Copy branch name`.

### P3 - Nice to Have

- None.

## Technical Notes

### Action

New function in `src/actions/tools.ts` next to `copyPRUrl` / `copyPRNumber`:

```typescript
export async function copyPRBranch(pr: PR): Promise<boolean> {
  if (!pr.headRefName) return false
  await $`echo -n ${pr.headRefName} | pbcopy`.quiet()
  return true
}
```

Return `boolean` so the caller can distinguish "nothing to copy" from the normal success case (matches `openInRiffTmuxWindow`'s pattern).

### Keybinding

- Add `"action.copyBranch"` to `KeyAction` union in `src/keybindings/types.ts`.
- Bind `b` → `action.copyBranch` in `src/keybindings/defaults.ts`. Verify `b` is currently unbound by grepping `defaults.ts`.
- Handle in `src/hooks/useKeyboardNav.ts` following the `copyPRUrl` handler pattern:

```typescript
if (keys.matches(key, "action.copyBranch")) {
  copyPRBranch(selectedPR).then((ok) => {
    dispatch({
      type: "SHOW_MESSAGE",
      message: ok
        ? `Copied ${selectedPR.headRefName}`
        : "No branch name available",
    })
  })
  return
}
```

### Command palette

In `src/commands/definitions.ts`, add after `action.copy_number`:

```typescript
{
  id: "action.copy_branch",
  label: "Copy branch name",
  category: "action",
  shortcut: "b",
  requiresPR: true,
  execute: async (ctx) => {
    const ok = await copyPRBranch(ctx.selectedPR!)
    return ok
      ? { type: "success", message: `Copied ${ctx.selectedPR!.headRefName}` }
      : { type: "error", message: "No branch name available" }
  },
},
```

Import `copyPRBranch` alongside the other tool imports at the top of the file.

### Help overlay

Add row in `src/components/HelpOverlay.tsx` under the Actions section, adjacent to the existing copy rows.

## File Structure

```
src/
├── actions/
│   └── tools.ts                # Add copyPRBranch()
├── keybindings/
│   ├── types.ts                # Add "action.copyBranch"
│   └── defaults.ts             # Bind b → action.copyBranch
├── hooks/
│   └── useKeyboardNav.ts       # Handle action.copyBranch
├── commands/
│   └── definitions.ts          # Add action.copy_branch command
└── components/
    └── HelpOverlay.tsx         # Add "Copy branch name" row

specs/
└── 032-copy-branch-name.md     # this file
```

## Open Questions

1. Is `b` free? If it collides with an existing binding, fall back to `B` (and mirror the capital/lowercase split used by `y` / `Y`).
