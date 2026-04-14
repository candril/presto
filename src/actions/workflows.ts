/**
 * GitHub Actions workflow dispatch helpers (spec 033).
 *
 * - listWorkflows / getWorkflowInputs / getRepoEnvironments cache per-repo for
 *   the app session; clearWorkflowCaches drops them on a refresh.
 * - dispatchWorkflow shells out to `gh workflow run` and surfaces stderr.
 */

import { $ } from "bun"
import { parse as parseYAML } from "yaml"

export interface WorkflowSummary {
  id: number
  name: string
  path: string
  state: string
}

export type WorkflowInputType = "string" | "choice" | "boolean" | "number" | "environment"

export interface WorkflowInput {
  key: string
  description?: string
  required: boolean
  default?: string
  type: WorkflowInputType
  options?: string[]
}

const workflowsCache = new Map<string, WorkflowSummary[]>()
const inputsCache = new Map<string, { dispatchable: boolean; inputs: WorkflowInput[] }>()
const envsCache = new Map<string, string[]>()

export function clearWorkflowCaches(): void {
  workflowsCache.clear()
  inputsCache.clear()
  envsCache.clear()
}

export async function listWorkflows(repo: string): Promise<WorkflowSummary[]> {
  const cached = workflowsCache.get(repo)
  if (cached) return cached
  // --paginate emits one JSON object per page; --jq '.workflows[]' splits each
  // page's array into newline-delimited workflow objects (JSONL). Parse line by
  // line — `--slurp` would simplify this but `gh api` rejects it with `--jq`.
  const text = await $`gh api repos/${repo}/actions/workflows --paginate --jq '.workflows[]'`.text()
  const list = text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as WorkflowSummary)
    .filter((w) => w.state === "active")
  workflowsCache.set(repo, list)
  return list
}

export async function getWorkflowInputs(
  repo: string,
  path: string
): Promise<{ dispatchable: boolean; inputs: WorkflowInput[] }> {
  const cacheKey = `${repo}:${path}`
  const cached = inputsCache.get(cacheKey)
  if (cached) return cached

  const result = await $`gh api repos/${repo}/contents/${path} --jq .content`.text()
  const yaml = Buffer.from(result.trim().replace(/\n/g, ""), "base64").toString("utf8")
  const parsed = parseYAML(yaml) as any
  const dispatch = parsed?.on?.workflow_dispatch
  const onValue = parsed?.on
  const dispatchable =
    !!dispatch ||
    onValue === "workflow_dispatch" ||
    (Array.isArray(onValue) && onValue.includes("workflow_dispatch"))

  if (!dispatchable) {
    const value = { dispatchable: false, inputs: [] }
    inputsCache.set(cacheKey, value)
    return value
  }

  const rawInputs = (dispatch && typeof dispatch === "object" ? dispatch.inputs : null) ?? {}
  const inputs: WorkflowInput[] = Object.entries(rawInputs).map(([key, def]: [string, any]) => ({
    key,
    description: def?.description,
    required: !!def?.required,
    default: def?.default != null ? String(def.default) : undefined,
    type: (def?.type ?? "string") as WorkflowInputType,
    options: Array.isArray(def?.options) ? def.options.map(String) : undefined,
  }))
  const value = { dispatchable: true, inputs }
  inputsCache.set(cacheKey, value)
  return value
}

/** List GitHub Environments configured on the repo. Returns [] if none / 404. */
export async function getRepoEnvironments(repo: string): Promise<string[]> {
  const cached = envsCache.get(repo)
  if (cached) return cached
  try {
    const names = (await $`gh api repos/${repo}/environments --jq '[.environments[].name]'`.json()) as string[]
    envsCache.set(repo, names)
    return names
  } catch {
    envsCache.set(repo, [])
    return []
  }
}

/**
 * Returns true if the PR's head and base repos differ (fork PR).
 * `gh workflow run --ref` only sees branches on the base repo, so fork PRs
 * cannot dispatch against their own head branch.
 */
export async function isForkPR(repo: string, prNumber: number): Promise<boolean> {
  try {
    const result = await $`gh pr view ${prNumber} -R ${repo} --json headRepository,headRepositoryOwner,baseRepository`.json() as any
    const headOwner = result?.headRepositoryOwner?.login
    const headName = result?.headRepository?.name
    const baseOwner = result?.baseRepository?.owner?.login ?? result?.baseRepository?.owner
    const baseName = result?.baseRepository?.name
    if (!headOwner || !headName || !baseName) return false
    return `${headOwner}/${headName}` !== `${baseOwner}/${baseName}`
  } catch {
    return false
  }
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
    const stderr = e?.stderr?.toString?.()?.trim() || e?.message || "Dispatch failed"
    return { success: false, message: stderr }
  }
}
