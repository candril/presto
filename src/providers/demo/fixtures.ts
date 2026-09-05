/**
 * The demo org (spec 042): three repos, a small team, and enough PRs to show every
 * status glyph and every merge verdict at once. Nothing here is real — the names are
 * invented and the dates are offsets from launch, so the time column reads the same
 * today and next year.
 */

import type {
  BaseSync,
  MergeMethod,
  MergeStateStatus,
  PR,
  PRPreview,
  ReviewDecision,
  StatusCheckRollup,
} from "../../types"
import type { RepoMergeSettings } from "../../actions/merge"
import type { WorkflowInput, WorkflowSummary } from "../../actions/workflows"

export const DEMO_USER = "mara"
export const DEMO_ORG = "polaris"
export const DEMO_REPOS = [`${DEMO_ORG}/api`, `${DEMO_ORG}/web`, `${DEMO_ORG}/infra`]

const launchedAt = Date.now()
const hoursAgo = (hours: number) => new Date(launchedAt - hours * 3_600_000).toISOString()

/** Deterministic pseudo-SHA so every launch shows the same commit ids */
export function fakeSha(seed: number): string {
  let x = (seed * 2654435761) >>> 0
  let out = ""
  while (out.length < 40) {
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    out += x.toString(16).padStart(8, "0")
  }
  return out.slice(0, 40)
}

export type CheckSpec = "pass" | "fail" | "running" | "queued" | "stalled" | "none" | "unstable"

interface PRSpec {
  repo: string
  number: number
  title: string
  author: string
  branch: string
  base?: string
  /** Hours ago */
  created: number
  /** Hours ago */
  updated: number
  state?: PR["state"]
  draft?: boolean
  merge: MergeStateStatus
  review?: ReviewDecision | null
  approvedBy?: string[]
  checks: CheckSpec
  /** Unresolved review threads and the comments inside them */
  threads?: { count: number; comments: number }
  /** Total human comments including thread comments */
  comments?: number
  autoMerge?: MergeMethod
  sync?: BaseSync
  behindRequired?: boolean
  body: string
  files: Array<[string, number, number] | [string, number, number, "added" | "modified" | "deleted" | "renamed"]>
  /** [message, hours ago] — newest last */
  commits: Array<[string, number]>
  reviews?: Array<[string, "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED", number]>
  requested?: string[]
  /** [author, body, hours ago, isReviewComment] */
  conversation?: Array<[string, string, number, boolean?]>
}

const CHECK_NAMES = ["build", "test", "lint"]

function rollupFor(spec: CheckSpec): StatusCheckRollup {
  const run = (name: string, status: "COMPLETED" | "IN_PROGRESS" | "QUEUED", conclusion: "SUCCESS" | "FAILURE" | null) =>
    ({ __typename: "CheckRun" as const, name, status, conclusion, workflowName: "CI" })
  switch (spec) {
    case "pass":
      return CHECK_NAMES.map((name) => run(name, "COMPLETED", "SUCCESS"))
    case "unstable":
      return [
        ...CHECK_NAMES.map((name) => run(name, "COMPLETED", "SUCCESS")),
        { __typename: "StatusContext", name: "coverage/codecov", status: "COMPLETED", conclusion: "FAILURE" },
      ]
    case "fail":
      return [run("build", "COMPLETED", "SUCCESS"), run("test", "COMPLETED", "FAILURE"), run("lint", "COMPLETED", "SUCCESS")]
    case "running":
      return [run("build", "COMPLETED", "SUCCESS"), run("test", "IN_PROGRESS", null), run("lint", "QUEUED", null)]
    case "queued":
    case "stalled":
    case "none":
      return []
  }
}

export interface DemoPR {
  pr: PR
  preview: PRPreview
}

function define(spec: PRSpec): DemoPR {
  const url = `https://github.com/${spec.repo}/pull/${spec.number}`
  const base = spec.base ?? "main"
  const state = spec.state ?? "OPEN"
  const commits = spec.commits.map(([message, hours], index) => ({
    oid: fakeSha(spec.number * 100 + index).slice(0, 7),
    message,
    author: spec.author,
    committedAt: hoursAgo(hours),
  }))
  const head = commits[commits.length - 1]
  const rollup = rollupFor(spec.checks)
  const reviews = (spec.reviews ?? []).map(([author, reviewState, hours]) => ({
    author,
    state: reviewState,
    submittedAt: hoursAgo(hours),
  }))
  const threads = spec.threads ?? { count: 0, comments: 0 }
  const conversation = (spec.conversation ?? [])
    .map(([author, body, hours, isReviewComment]) => ({
      author,
      body,
      createdAt: hoursAgo(hours),
      isReviewComment: isReviewComment ?? false,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const files = spec.files.map(([path, additions, deletions, status]) => ({
    path,
    additions,
    deletions,
    status: status ?? "modified",
  }))
  const commentCount = spec.comments ?? conversation.length + threads.comments
  const approvedBy = spec.approvedBy ?? reviews.filter((r) => r.state === "APPROVED").map((r) => r.author)

  const pr: PR = {
    number: spec.number,
    title: spec.title,
    author: { login: spec.author, name: DISPLAY_NAMES[spec.author] ?? null },
    url,
    state,
    isDraft: spec.draft ?? false,
    createdAt: hoursAgo(spec.created),
    updatedAt: hoursAgo(spec.updated),
    reviewDecision: spec.review ?? null,
    statusCheckRollup: rollup,
    commentCount,
    openCommentCount: threads.comments,
    headRefOid: fakeSha(spec.number * 100 + commits.length - 1),
    headCommittedAt: head.committedAt,
    checksQueued: spec.checks === "queued" || spec.checks === "stalled",
    unresolvedThreads: threads.count,
    approvedBy,
    headRefName: spec.branch,
    mergeStateStatus: spec.merge,
    autoMergeMethod: spec.autoMerge ?? null,
    baseRefName: base,
    baseSync: spec.sync ?? (spec.merge === "BEHIND" ? "behind" : "up-to-date"),
    baseUpdateRequired: spec.merge === "BEHIND" || spec.behindRequired === true,
  }

  const preview: PRPreview = {
    repo: spec.repo,
    number: spec.number,
    title: spec.title,
    state,
    isDraft: spec.draft ?? false,
    files,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    commits,
    author: { login: spec.author, createdAt: hoursAgo(spec.created) },
    reviews,
    requestedReviewers: spec.requested ?? [],
    checks: { overall: "neutral", checks: [] }, // derived from the rollup at read time
    body: spec.body,
    baseRef: base,
    headRef: spec.branch,
    mergeable: spec.merge === "DIRTY" ? "CONFLICTING" : spec.merge === "UNKNOWN" ? "UNKNOWN" : "MERGEABLE",
    commentCount,
    reviewCommentCount: threads.comments,
    recentComments: conversation,
  }
  return { pr, preview }
}

const DISPLAY_NAMES: Record<string, string> = {
  mara: "Mara Lindqvist",
  theo: "Theo Baptiste",
  ines: "Inès Okafor",
  kai: "Kai Tanaka",
  lena: "Lena Moreau",
  arjun: "Arjun Mehta",
  sofia: "Sofia Reyes",
}

const API = `${DEMO_ORG}/api`
const WEB = `${DEMO_ORG}/web`
const INFRA = `${DEMO_ORG}/infra`

export function buildFixtures(): DemoPR[] {
  return [
    // ── polaris/api ──────────────────────────────────────────────────────────────
    define({
      repo: API, number: 482, title: "Rate-limit the search endpoint per API key",
      author: "ines", branch: "ines/search-rate-limit", created: 30, updated: 2,
      merge: "CLEAN", review: "APPROVED", checks: "pass",
      reviews: [["theo", "APPROVED", 3], ["mara", "COMMENTED", 20]],
      conversation: [
        ["mara", "Do we want the bucket keyed on the key id or the tenant? Tenant feels safer against a leaked key.", 20],
        ["ines", "Key id — a tenant with several keys shouldn't have one runaway integration starve the others.", 18],
        ["theo", "LGTM. The sliding window is exactly what the gateway does, nice and consistent.", 3],
      ],
      body: `Search was the one endpoint without a limit and a single tenant found out.

- Token bucket per API key, 120 req/min, refilled every second
- \`429\` with \`Retry-After\` — the SDK already honours it
- Limits live in \`config/limits.toml\` so ops can tune without a deploy

Closes #470.`,
      files: [
        ["internal/http/middleware/ratelimit.go", 148, 0, "added"],
        ["internal/http/middleware/ratelimit_test.go", 96, 0, "added"],
        ["internal/http/router.go", 6, 1],
        ["config/limits.toml", 4, 0, "added"],
        ["docs/api/errors.md", 12, 2],
      ],
      commits: [["Add token bucket middleware", 28], ["Key the bucket on the API key, not the tenant", 18], ["Document 429 and Retry-After", 5]],
    }),
    define({
      repo: API, number: 479, title: "Migrate sessions table to a composite primary key",
      author: "mara", branch: "mara/sessions-composite-pk", created: 26, updated: 5,
      merge: "BLOCKED", review: "REVIEW_REQUIRED", checks: "pass", requested: ["kai", "arjun"],
      body: `The \`sessions\` table is keyed on \`id\` alone, so tenant lookups do a full scan of every hot row. This moves the primary key to \`(tenant_id, id)\`.

Migration runs in two steps so the deploy stays zero-downtime:

1. Add the new index online, backfill in batches of 5 000
2. Swap the primary key inside a short lock (~40 ms on staging)

Rollback is the reverse order and is scripted.`,
      files: [
        ["migrations/0142_sessions_composite_pk.up.sql", 31, 0, "added"],
        ["migrations/0142_sessions_composite_pk.down.sql", 14, 0, "added"],
        ["internal/store/sessions.go", 22, 9],
        ["internal/store/sessions_test.go", 40, 3],
      ],
      commits: [["Add composite index on sessions", 24], ["Backfill in batches", 12], ["Swap the primary key", 5]],
    }),
    define({
      repo: API, number: 475, title: "Retry transient S3 errors in the export worker",
      author: "kai", branch: "kai/export-retry", created: 50, updated: 26,
      merge: "BLOCKED", review: null, checks: "pass", threads: { count: 2, comments: 3 }, comments: 7,
      reviews: [["mara", "COMMENTED", 27]],
      conversation: [
        ["mara", "Is the jitter capped anywhere? Five retries with full jitter can add up to a minute.", 27, true],
        ["mara", "This swallows the error on the last attempt — we still want it in the log with the object key.", 27, true],
        ["kai", "Good catch on the swallow, fixing. On the cap: happy to add one, what feels right — 10s?", 26, true],
        ["arjun", "FWIW the ingest worker uses 8s and it's been fine.", 26],
      ],
      body: `S3 hands back the odd \`SlowDown\` and \`503\` under load and we currently fail the whole export on the first one.

Wraps \`PutObject\` in exponential backoff with full jitter — up to five attempts — and only fails the job when they are all spent.`,
      files: [
        ["internal/export/worker.go", 58, 12],
        ["internal/export/retry.go", 44, 0, "added"],
        ["internal/export/retry_test.go", 71, 0, "added"],
      ],
      commits: [["Retry PutObject with backoff", 48], ["Add jitter", 30], ["Log the final failure", 26]],
    }),
    define({
      repo: API, number: 471, title: "Add OpenTelemetry spans to the payment flow",
      author: "theo", branch: "theo/otel-payments", created: 96, updated: 70,
      merge: "DIRTY", review: "APPROVED", checks: "pass",
      reviews: [["mara", "APPROVED", 72]],
      conversation: [["mara", "Span names match the checkout service, good. Needs a rebase — the tracer setup moved in #468.", 72]],
      body: `Every payment step gets its own span so a slow authorisation shows up as a slow authorisation, not as a slow request.

Follows the naming in the checkout service: \`payment.authorize\`, \`payment.capture\`, \`payment.refund\`.`,
      files: [
        ["internal/payment/service.go", 64, 8],
        ["internal/payment/tracing.go", 37, 0, "added"],
        ["internal/telemetry/tracer.go", 5, 2],
      ],
      commits: [["Trace authorize and capture", 94], ["Trace refund", 80], ["Attribute the provider on the span", 70]],
    }),
    define({
      repo: API, number: 468, title: "Drop the legacy v1 webhook handlers",
      author: "mara", branch: "mara/drop-v1-webhooks", created: 150, updated: 140,
      draft: true, merge: "DRAFT", review: null, checks: "pass",
      body: `v1 webhooks have had zero deliveries for 90 days. This removes the handlers, the signing code and the fixtures.

Still a draft: waiting for the deprecation notice to go out on the 1st.`,
      files: [
        ["internal/webhooks/v1/handler.go", 0, 412, "deleted"],
        ["internal/webhooks/v1/signing.go", 0, 88, "deleted"],
        ["internal/webhooks/v1/handler_test.go", 0, 260, "deleted"],
        ["internal/http/router.go", 0, 9],
      ],
      commits: [["Remove v1 webhook handlers", 148], ["Remove v1 fixtures", 140]],
    }),
    define({
      repo: API, number: 466, title: "Update Go toolchain to 1.24",
      author: "renovate[bot]", branch: "renovate/go-1.x", created: 40, updated: 24,
      merge: "BLOCKED", review: null, checks: "fail",
      body: `This PR contains the following updates:

| Package | Update | Change |
|---|---|---|
| go | minor | \`1.23\` → \`1.24\` |

Release notes: https://go.dev/doc/go1.24`,
      files: [["go.mod", 1, 1], ["Dockerfile", 1, 1], [".github/workflows/ci.yml", 1, 1]],
      commits: [["Update Go toolchain to 1.24", 24]],
    }),
    define({
      repo: API, number: 463, title: "Cache tenant settings for 30 s",
      author: "lena", branch: "lena/tenant-settings-cache", created: 20, updated: 4,
      merge: "BLOCKED", review: "APPROVED", checks: "running", autoMerge: "squash",
      reviews: [["ines", "APPROVED", 5]],
      body: `Tenant settings are read on every request and change a few times a day. A 30 s in-process cache takes the store off the hot path; the settings endpoint invalidates on write.`,
      files: [
        ["internal/tenant/cache.go", 52, 0, "added"],
        ["internal/tenant/cache_test.go", 63, 0, "added"],
        ["internal/tenant/service.go", 9, 4],
      ],
      commits: [["Cache tenant settings", 18], ["Invalidate on write", 4]],
    }),
    define({
      repo: API, number: 458, title: "Expose the audit log over GraphQL",
      author: "arjun", branch: "arjun/audit-graphql", created: 120, updated: 48,
      merge: "BEHIND", review: "APPROVED", checks: "pass",
      reviews: [["mara", "APPROVED", 50], ["theo", "APPROVED", 60]],
      conversation: [["theo", "Cursor pagination on \`events\` please, the REST one is offset-based and it hurts.", 70], ["arjun", "Done, cursor is the event id.", 60]],
      body: `Adds \`auditLog(first:, after:)\` to the tenant type. Same filters as the REST endpoint, cursor-paginated.`,
      files: [
        ["internal/graphql/schema.graphql", 28, 0],
        ["internal/graphql/resolvers/audit.go", 91, 0, "added"],
        ["internal/graphql/resolvers/audit_test.go", 74, 0, "added"],
      ],
      commits: [["Add auditLog query", 110], ["Cursor pagination", 60], ["Filter by actor", 48]],
    }),
    define({
      repo: API, number: 451, title: "Fix flaky TestSessionExpiry",
      author: "sofia", branch: "sofia/fix-session-expiry-test", created: 8, updated: 3,
      merge: "BLOCKED", review: null, checks: "stalled",
      body: `The test compared wall-clock times across a goroutine boundary and lost by a millisecond every few hundred runs. Uses the fake clock now.`,
      files: [["internal/store/sessions_test.go", 11, 7]],
      commits: [["Use the fake clock in TestSessionExpiry", 3]],
    }),
    define({
      repo: API, number: 447, title: "Support cursor pagination on /orders",
      author: "kai", branch: "kai/orders-cursor", created: 60, updated: 8,
      merge: "UNSTABLE", review: "APPROVED", checks: "unstable",
      reviews: [["ines", "APPROVED", 9]],
      body: `Offset pagination on \`/orders\` falls over past page 200. Adds \`cursor\` (the order id) alongside \`offset\`, which stays for a release.`,
      files: [
        ["internal/http/orders.go", 44, 10],
        ["internal/http/orders_test.go", 58, 2],
        ["docs/api/orders.md", 16, 4],
      ],
      commits: [["Add cursor parameter", 55], ["Keep offset for one release", 30], ["Docs", 8]],
    }),

    // ── polaris/web ──────────────────────────────────────────────────────────────
    define({
      repo: WEB, number: 1203, title: "Checkout: show the delivery ETA on the summary step",
      author: "mara", branch: "mara/checkout-eta", created: 6, updated: 0.7,
      merge: "BLOCKED", review: "REVIEW_REQUIRED", checks: "running", requested: ["sofia"],
      body: `The ETA is already computed for the confirmation email; this shows it one step earlier where it actually changes minds.

Screenshot in the design ticket. Copy comes from \`eta.summary\` in the strings bundle.`,
      files: [
        ["src/checkout/Summary.tsx", 38, 4],
        ["src/checkout/useDeliveryEta.ts", 47, 0, "added"],
        ["src/checkout/Summary.test.tsx", 52, 1],
        ["src/i18n/en.json", 3, 0],
      ],
      commits: [["Compute the ETA on the summary step", 5], ["Show it", 2], ["Copy from design", 0.7]],
    }),
    define({
      repo: WEB, number: 1201, title: "Replace moment with date-fns",
      author: "theo", branch: "theo/date-fns", created: 48, updated: 22,
      merge: "BLOCKED", review: "CHANGES_REQUESTED", checks: "pass",
      reviews: [["ines", "CHANGES_REQUESTED", 23]],
      conversation: [["ines", "The relative-time formatter drops the locale — `formatDistance` needs the `locale` option passed through or German users get English.", 23, true]],
      threads: { count: 1, comments: 1 }, comments: 1,
      body: `moment is 70 kB gzipped and deprecated. date-fns is tree-shaken and we use six functions.

Bundle: 412 kB → 348 kB.`,
      files: [
        ["package.json", 1, 1],
        ["src/lib/dates.ts", 34, 51],
        ["src/orders/OrderRow.tsx", 3, 3],
        ["src/account/Invoices.tsx", 2, 2],
      ],
      commits: [["Swap moment for date-fns", 46], ["Fix the relative formatter", 22]],
    }),
    define({
      repo: WEB, number: 1198, title: "Design tokens: dark theme pass",
      author: "sofia", branch: "sofia/dark-tokens", created: 72, updated: 50,
      draft: true, merge: "DRAFT", checks: "pass",
      body: `First pass over the token set for dark mode. Contrast checked against WCAG AA for text; the chart palette still needs work.`,
      files: [["src/theme/tokens.dark.css", 132, 0, "added"], ["src/theme/index.ts", 8, 1]],
      commits: [["Dark tokens", 70], ["Fix contrast on muted text", 50]],
    }),
    define({
      repo: WEB, number: 1195, title: "Accessible focus rings across the app",
      author: "ines", branch: "ines/focus-rings", created: 36, updated: 3,
      merge: "CLEAN", review: "APPROVED", checks: "pass",
      reviews: [["sofia", "APPROVED", 4], ["mara", "APPROVED", 6]],
      body: `Replaces the per-component outline hacks with one \`:focus-visible\` ring token. Buttons, links, inputs and the menu all get the same 2 px ring.`,
      files: [
        ["src/theme/focus.css", 21, 0, "added"],
        ["src/components/Button.tsx", 2, 9],
        ["src/components/Menu.tsx", 1, 6],
        ["src/components/Input.tsx", 1, 4],
      ],
      commits: [["One focus ring token", 34], ["Apply to menu and inputs", 3]],
    }),
    define({
      repo: WEB, number: 1190, title: "Lazy-load the product gallery",
      author: "lena", branch: "lena/lazy-gallery", created: 1, updated: 0.3,
      merge: "UNKNOWN", checks: "none", sync: "unknown",
      body: `The gallery pulls 1.2 MB of images above the fold. Loads the first two eagerly and the rest on intersection.`,
      files: [["src/product/Gallery.tsx", 27, 6], ["src/product/useInView.ts", 19, 0, "added"]],
      commits: [["Lazy-load gallery images", 0.3]],
    }),
    define({
      repo: WEB, number: 1187, title: "Update vite to 6",
      author: "renovate[bot]", branch: "renovate/vite-6.x", created: 3, updated: 1,
      merge: "BLOCKED", checks: "running",
      body: `This PR contains the following updates:

| Package | Update | Change |
|---|---|---|
| vite | major | \`5.4.11\` → \`6.0.3\` |`,
      files: [["package.json", 1, 1], ["bun.lock", 40, 38]],
      commits: [["Update vite to 6", 1]],
    }),

    // ── polaris/infra ────────────────────────────────────────────────────────────
    define({
      repo: INFRA, number: 92, title: "Move the staging cluster to a spot node pool",
      author: "arjun", branch: "arjun/staging-spot", created: 130, updated: 120,
      merge: "BLOCKED", review: "APPROVED", checks: "pass",
      reviews: [["mara", "APPROVED", 121]],
      body: `Staging runs 24/7 on on-demand nodes. Spot cuts the bill by about 60 % and the workloads there tolerate a restart.

Needs the \`staging\` environment approval before it can merge.`,
      files: [["clusters/staging/nodepool.tf", 18, 6], ["clusters/staging/variables.tf", 4, 0]],
      commits: [["Spot node pool for staging", 128], ["Taint for batch workloads", 120]],
    }),
    define({
      repo: INFRA, number: 90, title: "Rotate the CI deploy key",
      author: "mara", branch: "mara/rotate-deploy-key", created: 28, updated: 24,
      merge: "HAS_HOOKS", review: "APPROVED", checks: "pass",
      reviews: [["arjun", "APPROVED", 25]],
      body: `Quarterly rotation. The old key is revoked in a follow-up once this has deployed.`,
      files: [["ci/deploy-key.enc", 1, 1], ["ci/README.md", 2, 2]],
      commits: [["Rotate deploy key", 24]],
    }),
    define({
      repo: INFRA, number: 88, title: "Terraform 1.9 upgrade",
      author: "kai", branch: "kai/terraform-1.9", created: 200, updated: 96,
      merge: "BLOCKED", review: "REVIEW_REQUIRED", checks: "pass", sync: "behind", behindRequired: false,
      requested: ["arjun"],
      body: `Provider pins bumped to match. \`terraform plan\` is clean on every workspace.`,
      files: [[".terraform-version", 1, 1], ["versions.tf", 3, 3], ["modules/vpc/versions.tf", 1, 1]],
      commits: [["Terraform 1.9", 198], ["Bump providers", 96]],
    }),

    // ── history, for state:merged / state:closed ─────────────────────────────────
    define({
      repo: API, number: 480, title: "Remove unused feature flags",
      author: "theo", branch: "theo/prune-flags", created: 30, updated: 22,
      state: "MERGED", merge: "CLEAN", review: "APPROVED", checks: "pass",
      reviews: [["mara", "APPROVED", 23]],
      body: `Eleven flags that have been 100 % on for over a year.`,
      files: [["internal/flags/registry.go", 0, 44], ["internal/flags/registry_test.go", 0, 30]],
      commits: [["Remove flags on since 2024", 24]],
    }),
    define({
      repo: WEB, number: 1199, title: "Experiment: infinite scroll on the catalogue",
      author: "lena", branch: "lena/infinite-scroll", created: 70, updated: 45,
      state: "CLOSED", merge: "BLOCKED", checks: "pass",
      conversation: [["lena", "Closing — the experiment lost on conversion, keeping the branch for reference.", 45]],
      body: `Behind the \`catalogue-infinite-scroll\` flag.`,
      files: [["src/catalogue/List.tsx", 41, 12]],
      commits: [["Infinite scroll behind a flag", 68]],
    }),
  ]
}

export const REPO_MERGE_SETTINGS: Record<string, RepoMergeSettings> = {
  [API]: { allowMergeCommit: true, allowSquashMerge: true, allowRebaseMerge: false, allowAutoMerge: true },
  [WEB]: { allowMergeCommit: false, allowSquashMerge: true, allowRebaseMerge: false, allowAutoMerge: true },
  [INFRA]: { allowMergeCommit: true, allowSquashMerge: false, allowRebaseMerge: true, allowAutoMerge: false },
}

export interface DemoWorkflow extends WorkflowSummary {
  dispatchable: boolean
  inputs: WorkflowInput[]
}

export const WORKFLOWS: Record<string, DemoWorkflow[]> = {
  [API]: [
    { id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active", dispatchable: true, inputs: [] },
    {
      id: 2, name: "Deploy", path: ".github/workflows/deploy.yml", state: "active", dispatchable: true,
      inputs: [
        { key: "environment", description: "Where to deploy", required: true, type: "environment" },
        { key: "version", description: "Image tag (defaults to the branch head)", required: false, type: "string" },
        { key: "run_migrations", description: "Apply pending migrations first", required: false, default: "true", type: "boolean" },
      ],
    },
    { id: 3, name: "Nightly load test", path: ".github/workflows/load.yml", state: "active", dispatchable: false, inputs: [] },
  ],
  [WEB]: [
    { id: 11, name: "CI", path: ".github/workflows/ci.yml", state: "active", dispatchable: true, inputs: [] },
    {
      id: 12, name: "Preview deploy", path: ".github/workflows/preview.yml", state: "active", dispatchable: true,
      inputs: [{ key: "region", description: "Edge region", required: true, default: "eu-west", type: "choice", options: ["eu-west", "us-east", "ap-south"] }],
    },
  ],
  [INFRA]: [
    { id: 21, name: "Plan", path: ".github/workflows/plan.yml", state: "active", dispatchable: true, inputs: [] },
    { id: 22, name: "Apply", path: ".github/workflows/apply.yml", state: "active", dispatchable: false, inputs: [] },
  ],
}

export const ENVIRONMENTS: Record<string, string[]> = {
  [API]: ["staging", "production"],
  [WEB]: ["preview", "production"],
  [INFRA]: ["staging", "production"],
}
