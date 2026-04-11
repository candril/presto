# Approve PR dialog

**Status**: In Progress

## Description

Add an "Approve PR" command palette action that opens a submit-review dialog modeled on riff's `ReviewPreview`. The dialog lets the user pick a review type (Comment, Approve, Request Changes), write an optional body, and submit via the GitHub reviews API. This gives presto users a way to approve PRs without leaving the TUI (or bouncing through `gh`/the browser).

## Out of Scope

- Local line comments (riff-only concept — presto has no per-line comment state)
- Merging existing GitHub pending reviews (no presto flow to reach a pending state)
- A keybinding — only reachable via the command palette for now
- Editing/deleting submitted reviews
- Multi-line body editing beyond simple typing + `Ctrl+J` newline + backspace

## Capabilities

### P1 - Must Have

- **Command palette entry** `action.review` labeled "Submit review" under ACTIONS, `requiresPR: true`, available when `state === "OPEN"`. Execute returns `{ type: "review_dialog" }` so the palette opens the dialog.
- **Dialog UI** modeled on the riff review preview:
  - Centered modal overlay, dimmed background
  - Header: "Submit review" + "Esc to close" hint
  - Type selector: three buttons `1: Comment`, `2: Approve`, `3: Request changes`. Selected type highlighted with the event color.
  - Body input: single text field, focused by default, accepts typing, backspace, and `Ctrl+J` for newline
  - Footer: `1/2/3 select · Enter submit · Esc cancel`
- **Keyboard handling**: `1/2/3` select event, `Enter` submit (if valid), `Esc` cancel/close, backspace edit, `Ctrl+J` newline, other printable chars append to body
- **Submit validation**: `REQUEST_CHANGES` and `COMMENT` require non-empty body; `APPROVE` can submit with an empty body. Self-approval on own PRs is blocked with an error banner.
- **GitHub API call**: `gh api repos/{owner}/{repo}/pulls/{number}/reviews --method POST --input -` with JSON body `{ event, body }`. Omit `commit_id` — GitHub defaults to the PR's latest commit, which is what we want.
- **Optimistic update** of `reviewDecision` to `APPROVED` or `CHANGES_REQUESTED` on success so the row reflects the new state immediately.

### P2 - Should Have

- **Error banner** in the dialog footer if the API call fails (shown inline instead of closing the dialog, so the user can retry or tweak the body)
- **Loading state**: while the API is in flight, show "Submitting..." in the footer and ignore further input

### P3 - Nice to Have

- Fuzzy-searchable via palette query ("approve", "review", "request changes")
- Help overlay entry under Actions

## Technical Notes

### New action module: `src/actions/review.ts`

```typescript
import { $ } from "bun"
import type { PR } from "../types"
import { getRepoName } from "../types"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

export interface SubmitReviewResult {
  success: boolean
  message: string
}

export async function submitPRReview(
  pr: PR,
  event: ReviewEvent,
  body: string
): Promise<SubmitReviewResult> {
  const repo = getRepoName(pr)
  const payload = JSON.stringify({ event, body })
  try {
    await $`echo ${payload} | gh api repos/${repo}/pulls/${pr.number}/reviews --method POST --input -`.quiet()
    const label =
      event === "APPROVE" ? "Approved" :
      event === "REQUEST_CHANGES" ? "Requested changes on" :
      "Commented on"
    return { success: true, message: `${label} #${pr.number}` }
  } catch (e: any) {
    const stderr = e?.stderr?.toString?.()?.trim() || e?.message || "Submit review failed"
    return { success: false, message: stderr }
  }
}
```

Note: `gh api` pipes stderr on non-zero exit, so the `catch` branch captures GitHub's error text (e.g. "Can not approve your own pull request").

### Command result type

Add `review_dialog` to `CommandResult` union in `src/commands/types.ts`:

```typescript
export type CommandResult =
  | { type: "success"; message?: string }
  | { type: "error"; message: string }
  | { type: "refresh" }
  | { type: "merge_dialog" }
  | { type: "rename_tab" }
  | { type: "review_dialog" }
```

### Command definition

In `src/commands/definitions.ts`, under the ACTIONS section:

```typescript
{
  id: "action.review",
  label: "Submit review",
  category: "action",
  requiresPR: true,
  available: (ctx) => ctx.selectedPR?.state === "OPEN",
  execute: async (_ctx) => ({ type: "review_dialog" }) as any,
},
```

### Dialog state + UI in `CommandPalette.tsx`

Mirror the existing `MergeDialogState` / `RenameDialogState` pattern:

```typescript
interface ReviewDialogState {
  event: ReviewEvent      // selected type, defaults to "APPROVE"
  body: string
  submitting: boolean
  error: string | null
}
const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null)
```

- In `handleExecute`, when `result.type === "review_dialog"`, `setReviewDialog({ event: "APPROVE", body: "", submitting: false, error: null })`.
- Add a `useKeyboard` branch *before* the merge dialog branch. Handle: `escape` (close), `return` (submit), `1/2/3` (select event), `backspace` (pop body char), `ctrl+j` (newline), printable chars → append.
- Validation: disable submit when `(event !== "APPROVE" && body.trim() === "") || submitting`.
- On submit: set `submitting: true`, call `submitPRReview`, on success optimistic-update the PR with `dispatch({ type: "UPDATE_PR", url: pr.url, updates: { reviewDecision: event === "APPROVE" ? "APPROVED" : event === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : pr.reviewDecision } })`, close, emit success. On error, set `error` and clear `submitting`.
- Render a new `reviewDialog`-specific view block: header, PR info row, three numbered type buttons (selected one highlighted with `theme.primary` bg), body input box with visible cursor `_`, error banner (red) if present, and a footer hint string.

### Where the dialog lives

Keep the dialog inside `CommandPalette.tsx` rather than extracting a new component. That matches the existing merge/rename dialog pattern and keeps the keyboard routing simple (one `useKeyboard` in one component).

## File Structure

```
src/
├── actions/
│   └── review.ts                 # NEW: submitPRReview()
├── commands/
│   ├── types.ts                  # Add "review_dialog" to CommandResult
│   └── definitions.ts            # Add action.review command
└── components/
    └── CommandPalette.tsx        # Add review dialog state, keys, view

specs/
└── 031-approve-pr-dialog.md      # this file
```
