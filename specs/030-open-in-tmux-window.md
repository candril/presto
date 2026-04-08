# Open in riff (new tmux window)

**Status**: In Progress

## Description

Add an `O` keybinding that opens the selected PR in `riff` inside a **new tmux window**, leaving presto running in the current window. This complements `Enter`, which opens riff inline by suspending presto.

The `O` key is currently bound to `action.repoBrowser` ("Open repository in GitHub"). That action stays available via the command palette but loses its dedicated shortcut.

## Out of Scope

- Splits / panes (only new windows for now)
- Generic "background launcher" abstraction for arbitrary tools
- Auto-detecting other multiplexers (zellij, screen) — tmux only
- Configurable tmux window name template
- Keeping the tmux window open after riff exits (default tmux behavior: window closes — accepted)

## Capabilities

### P1 - Must Have

- **`O` keybinding**: Opens selected PR via `tmux new-window -n "<repo>#<number>" riff gh:<repo>#<number>`. Tmux switches focus to the new window automatically; presto continues running in the background window — no `renderer.suspend()`.
- **Tmux detection**: If `$TMUX` is unset, show an error message ("Not running inside tmux") instead of attempting to spawn the command.
- **Mark PR as seen**: Same `recordPRInteraction()` side effect as the existing `Enter` (riff inline) handler — record view, repo visit, mark snapshot as seen.
- **Drop `O` from `action.repoBrowser`**: Remove the default keybinding. Action still listed in command palette under "Open repository in GitHub" — just no shortcut hint.

### P2 - Should Have

- **Status message**: Show `"Opened #123 in tmux window"` (or `"Failed to open tmux window"` on error) so the user gets feedback that the action ran, since the UI itself doesn't visibly change.
- **Help overlay entry**: Add row under Navigation: `O — Open in riff (new tmux window)`.

### P3 - Nice to Have

- **Command palette entry** for the new action with shortcut `O`, label `"Open in riff (tmux window)"`, category `action`.

## Technical Notes

### New action

Add `"action.openTmux"` to `KeyAction` union (`src/keybindings/types.ts`) and bind it to `"O"` in `defaultBindings` (`src/keybindings/defaults.ts`). Set `action.repoBrowser` to `""` (empty string = no default binding). Verified: `createKeybindings` in `src/keybindings/hook.ts` checks `if (!binding) return false` in `matches()`, and `parseKeyCombo("")` produces `{ key: "" }` which `matchesKey` rejects. So `""` is a safe sentinel for "unbound by default" — the action type still exists for the command palette.

### Spawn helper

New function in `src/actions/tools.ts`:

```typescript
/**
 * Open PR in riff inside a new tmux window.
 * Requires $TMUX to be set. Returns false if not in tmux.
 */
export async function openInRiffTmuxWindow(pr: PR): Promise<boolean> {
  if (!process.env.TMUX) return false

  const repo = getRepoName(pr)
  const target = `gh:${repo}#${pr.number}`
  const shortRepo = repo.split("/")[1] ?? repo
  const windowName = `${shortRepo}#${pr.number} ${pr.title}`

  // No -d: tmux switches focus to the new window so the user lands in riff.
  await $`tmux new-window -n ${windowName} riff ${target}`.quiet()
  return true
}
```

Notes:
- Tmux's default behavior (without `-d`) is to switch focus to the new window — that's what we want.
- Window name format: `<short-repo>#<number> <title>` (e.g. `presto#123 Add dark mode toggle`). Identifier is first so that tmux status-bar truncation never hides the `#number`.
- No length cap: tmux already truncates in the status line. The full name remains available via `tmux list-windows` and `prefix + w`.
- Use `$` template (Bun shell) for proper argument escaping — `tmux new-window` takes the command as separate args after `-n <name>`, so `riff`, `target`, and the window name (which may contain spaces, brackets, colons) go through Bun's escaping cleanly.

### Wiring in `useKeyboardNav.ts`

Add a handler near the existing `action.open` (riff inline) handler around line 421:

```typescript
// Open in riff in a new tmux window
if (keys.matches(key, "action.openTmux")) {
  recordPRInteraction()
  openInRiffTmuxWindow(selectedPR)
    .then((ok) => {
      dispatch({
        type: "SHOW_MESSAGE",
        message: ok
          ? `Opened #${selectedPR.number} in tmux window`
          : "Not running inside tmux",
      })
    })
    .catch(() => {
      dispatch({ type: "SHOW_MESSAGE", message: "Failed to open tmux window" })
    })
  return
}
```

Place this **before** the existing `action.repoBrowser` handler so neither shadows the other (they no longer share a key, but ordering in this file matters since `O` is now exclusively `action.openTmux`).

The existing `action.repoBrowser` handler stays in place — it just won't fire from a key press anymore (no default binding), and remains reachable via the command palette which dispatches by command id, not key.

### Command palette update

In `src/commands/definitions.ts`:
- `action.repo_browser` (line ~279): remove the `shortcut: "O"` field, since the shortcut no longer exists. Without `shortcut`, the palette will still show the command — just without a key hint.
- Optionally add a new command `action.open_tmux` with `shortcut: "O"` and the same execute logic, so the palette stays consistent with the keymap.

### Help overlay

In `src/components/HelpOverlay.tsx`, the Navigation section (lines 13-21):
- Replace the `action.repoBrowser` row with: `[keys.getKeyDisplay("action.openTmux"), "Open in riff (tmux window)"]`
- The repository-in-GitHub action stays discoverable via the command palette and is no longer in the help overlay (matches the "drop the binding" intent).

## File Structure

```
src/
├── actions/
│   └── tools.ts                # Add openInRiffTmuxWindow()
├── keybindings/
│   ├── types.ts                # Add "action.openTmux" to KeyAction
│   └── defaults.ts             # Bind O → action.openTmux; drop O from repoBrowser
├── hooks/
│   └── useKeyboardNav.ts       # Handle action.openTmux
├── commands/
│   └── definitions.ts          # Drop shortcut from repo_browser; optional new command
└── components/
    └── HelpOverlay.tsx         # Replace repoBrowser row with openTmux row

specs/
└── 030-open-in-tmux-window.md  # this file
```

## Resolved Decisions

1. **Focus switch**: tmux switches focus to the new window (no `-d`).
2. **Empty-string binding**: verified safe — `createKeybindings.matches()` returns false on empty strings.
3. **Window closing on early riff exit**: accepted — no `; read` trailer.
