/**
 * Preview Panel component - right side panel showing PR details (spec 014)
 */

import { useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { SyntaxStyle, RGBA } from "@opentui/core"
import { theme } from "../theme"
import { Spinner } from "./Loading"
import type { PRPreview, PRReview, PreviewCheckStatus, ChangedFile } from "../types"

// Shared syntax style for markdown rendering (lazy init)
let sharedSyntaxStyle: SyntaxStyle | null = null
function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      "markup.heading": { fg: RGBA.fromHex(theme.primary), bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.raw": { fg: RGBA.fromHex(theme.success) },
      "markup.strikethrough": { dim: true },
      "markup.link": { fg: RGBA.fromHex(theme.primary) },
      "markup.link.label": { fg: RGBA.fromHex(theme.primary), underline: true },
      "markup.link.url": { fg: RGBA.fromHex(theme.textDim) },
      "markup.list": { fg: RGBA.fromHex(theme.warning) },
      "punctuation.special": { fg: RGBA.fromHex(theme.textDim), italic: true },
      "keyword": { fg: RGBA.fromHex(theme.prMerged) },
      "string": { fg: RGBA.fromHex(theme.success) },
      "number": { fg: RGBA.fromHex(theme.warning) },
      "comment": { fg: RGBA.fromHex(theme.textMuted), italic: true },
      "function": { fg: RGBA.fromHex(theme.primary) },
      "type": { fg: RGBA.fromHex(theme.warning) },
      "variable": { fg: RGBA.fromHex(theme.text) },
      "operator": { fg: RGBA.fromHex(theme.primary) },
      "punctuation": { fg: RGBA.fromHex(theme.textDim) },
      "property": { fg: RGBA.fromHex(theme.prMerged) },
      "constant": { fg: RGBA.fromHex(theme.warning) },
    })
  }
  return sharedSyntaxStyle
}

interface PreviewPanelProps {
  preview: PRPreview | null
  loading: boolean
  scrollOffset: number
}

export function PreviewPanel({ preview, loading, scrollOffset }: PreviewPanelProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // Sync scroll position
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(scrollOffset)
    }
  }, [scrollOffset])

  // Show loading state
  if (loading) {
    return (
      <box
        width="50%"
        flexDirection="column"
        border={["left"]}
        borderStyle="single"
        borderColor={theme.border}
      >
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <Spinner />
        </box>
        <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.textDim}>Ctrl-d/u: scroll  p: close</text>
        </box>
      </box>
    )
  }

  // Show empty state when no preview
  if (!preview) {
    return (
      <box
        width="50%"
        flexDirection="column"
        border={["left"]}
        borderStyle="single"
        borderColor={theme.border}
      >
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg={theme.textDim}>No preview available</text>
        </box>
        <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.textDim}>Ctrl-d/u: scroll  p: close</text>
        </box>
      </box>
    )
  }

  // Show preview content
  return (
    <box
      width="50%"
      flexDirection="column"
      border={["left"]}
      borderStyle="single"
      borderColor={theme.border}
    >

      <scrollbox ref={scrollRef} flexGrow={1} paddingLeft={1} paddingRight={1}>
          {/* Branch info */}
          <box height={1} marginTop={1}>
            <text>
              <span fg={theme.primary}>{preview.author.login}</span>
              <span fg={theme.textDim}> wants to merge </span>
              <span fg={theme.success}>{preview.headRef}</span>
              <span fg={theme.textDim}> → </span>
              <span fg={theme.primary}>{preview.baseRef}</span>
            </text>
          </box>

          {/* Status row */}
          <box height={1} marginTop={1}>
            <text>
              <ChecksIndicator checks={preview.checks} />
              <MergeableIndicator state={preview.mergeable} />
              <CommentsIndicator count={preview.commentCount + preview.reviewCommentCount} />
            </text>
          </box>

          {/* Reviewers */}
          {preview.reviews.length > 0 && (
            <box height={1} marginTop={1}>
              <text>
                <span fg={theme.textDim}>Reviews: </span>
                {preview.reviews.map((r, i) => (
                  <span key={r.author}>
                    {i > 0 && " "}
                    <ReviewBadge review={r} />
                  </span>
                ))}
              </text>
            </box>
          )}

          {/* Files section */}
          <box flexDirection="column" marginTop={1}>
            <text fg={theme.textMuted}>
              Files ({preview.files.length}):
            </text>
            <FilesList files={preview.files.slice(0, 15)} />
            {preview.files.length > 15 && (
              <box height={1}>
                <text fg={theme.textDim}>
                  +{preview.files.length - 15} more files
                </text>
              </box>
            )}
          </box>

          {/* Commits section */}
          {preview.commits.length > 0 && (
            <box flexDirection="column" marginTop={1}>
              <text fg={theme.textMuted}>
                Commits ({preview.commits.length}):
              </text>
              {preview.commits.slice(0, 8).map((commit) => (
                <box key={commit.oid} height={1}>
                  <text>
                    <span fg={theme.warning}>{commit.oid}</span>
                    <span fg={theme.text}> {truncate(commit.message, 45)}</span>
                  </text>
                </box>
              ))}
              {preview.commits.length > 8 && (
                <box height={1}>
                  <text fg={theme.textDim}>
                    +{preview.commits.length - 8} more commits
                  </text>
                </box>
              )}
            </box>
          )}

          {/* Description */}
          {preview.body && preview.body.trim() && (
            <box flexDirection="column" marginTop={1} marginBottom={1}>
              <text fg={theme.textMuted}>Description:</text>
              <markdown
                content={preview.body}
                syntaxStyle={getSyntaxStyle()}
              />
            </box>
          )}
        </scrollbox>

      {/* Footer */}
      <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
        <text fg={theme.textDim}>
          Ctrl-d/u: scroll  p: close
        </text>
      </box>
    </box>
  )
}

function ChecksIndicator({ checks }: { checks: PreviewCheckStatus }) {
  const icon =
    checks.overall === "success" ? "✓" :
    checks.overall === "failure" ? "✗" :
    checks.overall === "pending" ? "○" :
    "─"

  const color =
    checks.overall === "success" ? theme.success :
    checks.overall === "failure" ? theme.error :
    checks.overall === "pending" ? theme.warning :
    theme.textDim

  const failedCount = checks.checks.filter((c) => c.status === "failure").length

  return (
    <span>
      <span fg={color}>{icon}</span>
      <span fg={theme.textDim}> Checks</span>
      {failedCount > 0 && (
        <span fg={theme.error}> ({failedCount} failed)</span>
      )}
    </span>
  )
}

function MergeableIndicator({ state }: { state: string }) {
  if (state === "CONFLICTING") {
    return <span fg={theme.error}>  Conflicts</span>
  }
  if (state === "MERGEABLE") {
    return <span fg={theme.success}>  Mergeable</span>
  }
  return null
}

function CommentsIndicator({ count }: { count: number }) {
  if (count === 0) return null
  return <span fg={theme.textDim}>  {count} comments</span>
}

function ReviewBadge({ review }: { review: PRReview }) {
  const icon =
    review.state === "APPROVED" ? "✓" :
    review.state === "CHANGES_REQUESTED" ? "✗" :
    "○"

  const color =
    review.state === "APPROVED" ? theme.success :
    review.state === "CHANGES_REQUESTED" ? theme.error :
    theme.warning

  return (
    <span>
      <span fg={color}>{icon}</span>
      <span fg={theme.text}>{review.author}</span>
    </span>
  )
}

function FilesList({ files }: { files: ChangedFile[] }) {
  // Calculate max path length that fits, leaving room for stats (roughly 12 chars: " +999/-999")
  // Use a reasonable max that leaves space for the stats column
  const maxPathLen = 50
  
  return (
    <>
      {files.map((file) => (
        <FileRow key={file.path} file={file} maxPathLen={maxPathLen} />
      ))}
    </>
  )
}

interface FileRowProps {
  file: ChangedFile
  maxPathLen: number
}

function FileRow({ file, maxPathLen }: FileRowProps) {
  const statusIcon =
    file.status === "added" ? "A" :
    file.status === "deleted" ? "D" :
    file.status === "renamed" ? "R" :
    "M"

  const statusColor =
    file.status === "added" ? theme.success :
    file.status === "deleted" ? theme.error :
    file.status === "renamed" ? theme.warning :
    theme.primary

  // Format stats with fixed width for alignment
  const stats = `+${file.additions}/-${file.deletions}`
  const truncatedPath = truncatePath(file.path, maxPathLen)
  const padding = " ".repeat(Math.max(0, maxPathLen - truncatedPath.length))

  return (
    <box height={1}>
      <text>
        <span fg={statusColor}>{statusIcon}</span>
        <span fg={theme.text}> {truncatedPath}{padding} </span>
        <span fg={theme.success}>+{file.additions}</span>
        <span fg={theme.textDim}>/</span>
        <span fg={theme.error}>-{file.deletions}</span>
      </text>
    </box>
  )
}

/** Truncate string from the end */
function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len - 1) + "…"
}

/** Truncate file path from the middle, keeping filename visible */
function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path
  
  const parts = path.split("/")
  const filename = parts.pop() || ""
  
  // If filename alone is too long, truncate it from the end
  if (filename.length >= maxLen - 3) {
    return "…" + filename.slice(-(maxLen - 1))
  }
  
  // Keep as much of the path as possible, with ellipsis in middle
  const availableForPath = maxLen - filename.length - 4 // "…/…/" takes 4 chars
  
  if (availableForPath <= 0) {
    return "…/" + filename
  }
  
  const prefix = parts.join("/")
  if (prefix.length <= availableForPath) {
    return prefix + "/" + filename
  }
  
  // Take start of path
  const startLen = Math.floor(availableForPath / 2)
  const start = prefix.slice(0, startLen)
  
  return start + "…/" + filename
}


