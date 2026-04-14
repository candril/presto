# Trigger GitHub workflow for PR

**Status**: Ready

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
  - `choice` → cycle through `options[]` with left/right arrows
  - `boolean` → toggle (`true` / `false`) with space
  - `string` / `number` / unset → single-line text input, prefilled with `default` if present
  - `environment` → cycle through the repo's actual GitHub Environments (see "Env selection" below)
  Required inputs (`required: true` and no `default`) block `Enter` until filled, matching the review dialog's `submitAllowed` pattern.
- **Dispatch**: On confirm, run `gh workflow run <id> -R <repo> --ref <headRefName> -f key=value …`. Show a success message `Triggered <workflow-name> on <branch>` or an error toast with the `gh` stderr on failure.
- **Branch validation**: If `pr.headRefName` is `null` (fork deleted / unknown), abort with `No head branch available` before opening the dialog.
- **Fork PR guard**: If the PR's head repo differs from the base repo (fork PR), block the action with `Cross-repo PRs can't dispatch workflows on the base repo` *before* opening the dialog. The head branch isn't on the base repo, so `gh workflow run --ref` would 422. Cheap check: `pr.headRepository?.nameWithOwner !== pr.baseRepository?.nameWithOwner`. **Action item: verify these fields exist on the PR type; if not, add them to the GraphQL fetch in `src/providers/github.ts`.**

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

Env selection is first-class — the dialog must let the user pick an actual GitHub Environment, not type its name.

- **`environment` input type** (native Actions type): fetch `gh api repos/<repo>/environments --jq '.environments[].name'` lazily (when the input is first focused), cache the result in-memory keyed by repo, and render as a left/right cycling picker over the returned names.
  - If the API returns 0 environments or 404s (no environments configured on the repo), fall back to a free-text input with footer hint `No environments configured on <repo> — type a value`.
  - If the API errors for another reason (auth, network), show the error in the input footer but still allow free-text entry so the user isn't blocked.
  - The default GitHub token from `gh auth login` has `repo` scope, which is sufficient to read environments on repos the user can access.
- **`choice` inputs** (e.g. `options: [staging, production]` declared inline in the workflow YAML): render as a left/right cycling selector. No API call needed.
- **Env-named inputs without `type: environment`** (heuristic — input key `env` / `environment` typed as `string`): treat as a plain string. We don't auto-promote to env picker; if the workflow author wanted a real env picker they would have set `type: environment`. Avoids surprising behavior on workflows that genuinely want a free-form string.

```typescript
// In actions/workflows.ts
const envCache = new Map<string, string[]>()

export async function getRepoEnvironments(repo: string): Promise<string[]> {
  const cached = envCache.get(repo)
  if (cached) return cached
  const names = await $`gh api repos/${repo}/environments --jq '[.environments[].name]'`.json() as string[]
  envCache.set(repo, names)
  return names
}
```

Cache survives only for the app session (matches workflow-list cache); cleared by `R` refresh.

## Resolved Decisions

1. **Fork PRs**: blocked upfront (option a). See "Fork PR guard" capability above.
2. **YAML dep**: add `yaml` (Eemeli Aro). Smaller and better-typed than `js-yaml`. Size irrelevant for a TUI.
3. **Env selection**: real GitHub Environments are first-class via `gh api repos/<repo>/environments`. See "Env selection" above.
4. **Multiple workflows on same branch**: not deduped — `gh workflow run` fires a new run each time. Acceptable.

## Open Questions

1. **PR type fields**: confirm `headRepository.nameWithOwner` and `baseRepository.nameWithOwner` are present on the PR type / GraphQL fetch. If not, add them — cheap.

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
