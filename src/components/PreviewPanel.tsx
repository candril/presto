/**
 * Preview Panel component - right side panel showing PR details (spec 014)
 */

import { useRef, useEffect } from "react"
import { useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { SyntaxStyle, RGBA } from "@opentui/core"
import { theme } from "../theme"
import { Spinner } from "./Loading"
import type { PRPreview, PRReview, PreviewCheckStatus, ChangedFile, PreviewPosition } from "../types"

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
  position: PreviewPosition
}

export function PreviewPanel({ preview, loading, scrollOffset, position }: PreviewPanelProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { width: terminalWidth } = useTerminalDimensions()
  const isBottom = position === "bottom"
  
  // Calculate available width for content
  // Right mode: 50% of terminal minus borders/padding (~4 chars)
  // Bottom mode: full width minus borders/padding (~4 chars)
  const contentWidth = isBottom 
    ? terminalWidth - 4
    : Math.floor(terminalWidth / 2) - 4

  // Sync scroll position
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(scrollOffset)
    }
  }, [scrollOffset])

  // Container props based on position
  const containerProps = isBottom
    ? {
        height: "50%" as const,
        width: "100%" as const,
        flexDirection: "column" as const,
        border: ["top"] as ("top" | "bottom" | "left" | "right")[],
        borderStyle: "single" as const,
        borderColor: theme.border,
      }
    : {
        width: "50%" as const,
        flexDirection: "column" as const,
        border: ["left"] as ("top" | "bottom" | "left" | "right")[],
        borderStyle: "single" as const,
        borderColor: theme.border,
      }

  const positionHint = isBottom ? "right" : "bottom"
  const footerHint = `Ctrl-d/u: scroll  p: close  P: ${positionHint}`

  // Show loading state
  if (loading) {
    return (
      <box {...containerProps}>
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <Spinner />
        </box>
        <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.textDim}>{footerHint}</text>
        </box>
      </box>
    )
  }

  // Show empty state when no preview
  if (!preview) {
    return (
      <box {...containerProps}>
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg={theme.textDim}>No preview available</text>
        </box>
        <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.textDim}>{footerHint}</text>
        </box>
      </box>
    )
  }

  // Show preview content
  return (
    <box {...containerProps}>

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

          {/* Description - right after metadata */}
          {preview.body && preview.body.trim() && (
            <box flexDirection="column" marginTop={1}>
              <text fg={theme.textMuted}>Description:</text>
              <markdown
                content={preview.body}
                syntaxStyle={getSyntaxStyle()}
              />
            </box>
          )}

          {/* Files section */}
          <box flexDirection="column" marginTop={1}>
            <text fg={theme.textMuted}>Files:</text>
            <FilesList files={preview.files} maxWidth={contentWidth} />
          </box>

          {/* Commits section */}
          {preview.commits.length > 0 && (
            <box flexDirection="column" marginTop={1}>
              <text fg={theme.textMuted}>Commits:</text>
              {preview.commits.map((commit) => (
                <box key={commit.oid} height={1}>
                  <text>
                    <span fg={theme.warning}>{commit.oid}</span>
                    <span fg={theme.text}> {truncate(commit.message, contentWidth - 9)}</span>
                  </text>
                </box>
              ))}
            </box>
          )}
        </scrollbox>

      {/* Footer */}
      <box height={1} paddingLeft={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
        <text fg={theme.textDim}>{footerHint}</text>
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
      <span fg={theme.text}> {review.author}</span>
    </span>
  )
}

function FilesList({ files, maxWidth }: { files: ChangedFile[]; maxWidth: number }) {
  // Reserve space for: status icon (1) + space (1) + stats (~12: " +999/-999")
  const maxPathLen = Math.max(20, maxWidth - 14)
  
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


