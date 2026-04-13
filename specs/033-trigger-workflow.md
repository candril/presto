# Trigger GitHub workflow for PR

**Status**: Draft

## Description

Add a command-palette action that lets the user pick a GitHub Actions workflow for the selected PR's repo and dispatch it against the PR's head branch. If the workflow declares `workflow_dispatch.inputs` (e.g. an `environment` choice input), presto prompts for each input before firing the run. This covers the common "trigger a deploy to staging/prod" case without hard-coding anything environment-specific.

## Out of Scope

- Rerunning existing failed/pending check runs (separate action; could be spec 034 — `gh run rerun <id> --failed`).
- CI systems other than GitHub Actions (CircleCI, Buildkite, etc.).
- Monitoring the triggered run's progress inside presto — we just fire and forget, the user can watch via `gh run watch` or the browser.
- Caching workflow lists across app sessions. In-memory cache per repo is fine; discard on refresh.
- Editing or saving "last used inputs" per workflow (P3 candidate, not P1).

## Capabilities

### P1 - Must Have

- **Command palette entry**: `Trigger workflow…` under `action`, `requiresPR: true`, no default shortcut.
- **Workflow list dialog**: Fetches `gh workflow list -R <repo> --json name,id,state,path` for the PR's repo and shows active workflows only (`state === "active"`). Same overlay-modal styling as the merge / review dialogs. `Ctrl+n/p` or arrows to navigate, `Enter` to select, `Esc` to cancel.
- **Only dispatchable workflows**: Filter to workflows whose YAML contains `on.workflow_dispatch`. The command is available whenever a PR is selected; unfilterable workflows simply don't appear in the list. If the list is empty, show `No dispatchable workflows in <repo>` and close on `Esc`.
- **Input prompt**: After the user picks a workflow, fetch the YAML (`gh api repos/<repo>/contents/<path> --jq .content | base64 -d`) and parse `on.workflow_dispatch.inputs`. For each input, prompt according to `type`:
  - `choice` → select from `options[]`
  - `boolean` → toggle (`true` / `false`)
  - `string` / `number` / unset → single-line text input, prefilled with `default` if present
  - `environment` → treat as string (GitHub doesn't expose env lists via the workflow YAML; the user types the env name). Mention this limitation in the footer.
  Required inputs (`required: true` and no `default`) block `Enter` until filled, matching the review dialog's `submitAllowed` pattern.
- **Dispatch**: On confirm, run `gh workflow run <id> -R <repo> --ref <headRefName> -f key=value …`. Show a success message `Triggered <workflow-name> on <branch>` or an error toast with the `gh` stderr on failure.
- **Branch validation**: If `pr.headRefName` is `null` (fork deleted / unknown), abort with `No head branch available` before opening the dialog.

### P2 - Should Have

- **In-memory workflow cache** keyed by repo, invalidated by `R` (refresh) — avoids refetching the list every time the palette opens.
- **YAML fetch parallelism**: fetch workflow YAML lazily only after the user picks one (not for every workflow in the list), to keep the initial list fast. Filter "dispatchable" by a cheaper heuristic first — `gh api repos/<repo>/actions/workflows/<id>/dispatches` returns 422 for non-dispatchable, but we'd rather not probe; instead, fetch YAML on demand and if `workflow_dispatch` is missing, show `Workflow is not dispatchable` and return to the list.

  Decision for P1: fetch YAML only on selection (simpler, one extra call per attempt). Move to a "filter upfront" strategy only if it becomes noticeably slow.

### P3 - Nice to Have

- **Remember last inputs** per `<repo>/<workflow>` in a new slice of the history file, prefilled on next open.
- **Input validation for `choice`**: show allowed values inline under the input.
- **Shortcut from PR list**: e.g. `Shift+T` — deferred until we see if users actually want it.

## Technical Notes

### New module

`src/actions/workflows.ts` — pure shell/API helpers, no UI:

```typescript
import { $ } from "bun"
import { parse as parseYAML } from "yaml" // already a transitive dep? check — otherwise add

export interface WorkflowSummary {
  id: number
  name: string
  path: string
  state: string
}

export interface WorkflowInput {
  key: string
  description?: string
  required: boolean
  default?: string
  type: "string" | "choice" | "boolean" | "number" | "environment"
  options?: string[]
}

export async function listWorkflows(repo: string): Promise<WorkflowSummary[]> {
  const raw = await $`gh api repos/${repo}/actions/workflows --jq '.workflows'`.json()
  return (raw as WorkflowSummary[]).filter((w) => w.state === "active")
}

export async function getWorkflowInputs(
  repo: string,
  path: string
): Promise<{ dispatchable: boolean; inputs: WorkflowInput[] }> {
  const content = await $`gh api repos/${repo}/contents/${path} --jq .content`.text()
  const yaml = Buffer.from(content.trim(), "base64").toString("utf8")
  const parsed = parseYAML(yaml)
  const dispatch = parsed?.on?.workflow_dispatch
  if (!dispatch) return { dispatchable: false, inputs: [] }

  const rawInputs = dispatch.inputs ?? {}
  const inputs: WorkflowInput[] = Object.entries(rawInputs).map(([key, def]: any) => ({
    key,
    description: def?.description,
    required: !!def?.required,
    default: def?.default != null ? String(def.default) : undefined,
    type: def?.type ?? "string",
    options: def?.options,
  }))
  return { dispatchable: true, inputs }
}

export async function dispatchWorkflow(
  repo: string,
  workflowId: number,
  ref: string,
  inputs: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  try {
    const args = Object.entries(inputs).flatMap(([k, v]) => ["-f", `${k}=${v}`])
    const result = await $`gh workflow run ${workflowId} -R ${repo} --ref ${ref} ${args}`.quiet()
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr.toString().trim() || "Dispatch failed" }
    }
    return { success: true, message: "Triggered" }
  } catch (e: any) {
    return { success: false, message: e?.stderr?.toString?.()?.trim() || e?.message || "Dispatch failed" }
  }
}
```

Notes:
- `yaml` dep: check `package.json`. If not present, add (`bun add yaml`). Small, zero-dep library.
- Using `gh api repos/.../actions/workflows` instead of `gh workflow list` because the JSON shape is stable and exposes `path` directly.

### Command

In `src/commands/definitions.ts`, add under the Actions section:

```typescript
{
  id: "action.trigger_workflow",
  label: "Trigger workflow…",
  category: "action",
  requiresPR: true,
  available: (ctx) => !!ctx.selectedPR?.headRefName,
  execute: async (_ctx) => {
    return { type: "workflow_dialog" } as any
  },
},
```

### Dialog states in `CommandPalette.tsx`

Add a new dialog state union, following the review-dialog pattern:

```typescript
type WorkflowDialogState =
  | { stage: "list"; loading: boolean; workflows: WorkflowSummary[]; selectedIndex: number; error: string | null }
  | { stage: "inputs"; workflow: WorkflowSummary; inputs: WorkflowInput[]; values: Record<string, string>; focusedIndex: number; submitting: boolean; error: string | null }
  | { stage: "no-inputs"; workflow: WorkflowSummary; submitting: boolean; error: string | null } // workflow is dispatchable but has zero declared inputs → confirm & go
```

Flow:
1. `execute` returns `{ type: "workflow_dialog" }`. `CommandPalette` sets `workflowDialog = { stage: "list", loading: true, … }` and kicks off `listWorkflows(repo)`.
2. User selects a workflow → fetch YAML via `getWorkflowInputs`.
   - `dispatchable === false` → toast error, stay on list.
   - `inputs.length === 0` → go to `"no-inputs"` stage (just a confirm screen).
   - otherwise → `"inputs"` stage.
3. In `"inputs"` stage, `Tab` / `Shift-Tab` moves between inputs, `Enter` on last required-filled submits. For `choice` inputs, left/right arrows cycle options. For `boolean`, space toggles.
4. Submit → `dispatchWorkflow(repo, workflow.id, pr.headRefName, values)` → toast + `onClose()`.

Styling: reuse `theme.modalBg`, `theme.overlayBg`, `theme.headerBg`, same box structure as `ReviewDialog` (header row, body, footer with Enter hint).

### Env selection

The resolved approach:

- **`environment` input type** (a native Actions input type) is treated as a plain string input — GitHub does not expose per-repo environment names over the REST API in a way that's usable via `gh` without extra scopes, and surfacing them here isn't worth the added complexity for P1. The user types the environment name.
- **`choice` inputs** (the far more common pattern — workflows declare a dropdown of e.g. `["staging", "production"]`) are rendered as a proper left/right cycling selector.
- If we later want a richer env picker: fetch `gh api repos/<repo>/environments` (requires `repo` scope; already implicit in `gh auth login` for most users) and convert `environment` inputs into a choice list. Track as P3.

## Open Questions

1. **Head-branch ref for forks**: `pr.headRefName` is the branch name on the *head* repo. `gh workflow run --ref` on a base repo can only dispatch refs that exist on the base. If the PR is from a fork, the branch is not on the base, and dispatch will 422. Do we: (a) detect fork PRs and block the command with `Cross-repo PRs can't dispatch workflows on base`, or (b) let `gh` fail and show its stderr? Recommendation: **(a)** — cheap check via `pr.headRepository?.nameWithOwner !== pr.baseRepository?.nameWithOwner`. Needs verification that those fields exist on the PR type.
2. **YAML dep**: confirm `yaml` isn't already transitive. If adding, prefer `yaml` (the Eemeli Aro one) over `js-yaml` — smaller and better types.
3. **Multiple workflows on same branch**: nothing to resolve, but worth noting — `gh workflow run` fires a new run each time; no dedup.

## File Structure

```
src/
├── actions/
│   └── workflows.ts            # listWorkflows, getWorkflowInputs, dispatchWorkflow
├── commands/
│   └── definitions.ts          # action.trigger_workflow command
└── components/
    └── CommandPalette.tsx      # WorkflowDialogState + dialog rendering

package.json                    # add "yaml" if not present

specs/
└── 033-trigger-workflow.md     # this file
```
