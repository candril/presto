/**
 * PR List component - displays pull requests in a table-like layout
 * 
 * Column order: State | Checks | Review | Time | Title (flex) | Author | Repo
 * Title column format: #1234 PR title here...
 */

import { useRef, useEffect } from "react"
import { useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { theme, getMarkColor } from "../theme"
import type { PR, CheckState, ReviewDecision, ColumnVisibility } from "../types"
import { getRepoName, getShortRepoName, computeCheckState } from "../types"
import { formatRelativeTime } from "../utils/time"
import { truncate } from "../utils/string"
import { getPRKey, isPRMarked, getPRMark, type History } from "../history"
import { prHasChanges } from "../notifications"

/** Column widths for table-like layout */
const COL = {
  state: 2,      // icon + space
  checks: 2,     // icon + space
  review: 1,     // icon (no trailing space)
  comments: 3,   // comment count (e.g. "12" or "99+")
  time: 4,       // "1d" or "2mo" (without "ago")
  repo: 16,      // Short repo name
  author: 16,    // @username
  // title: remaining space (includes PR number prefix)
}

/** Calculate total fixed width (everything except title) */
function getFixedColumnsWidth(v: ColumnVisibility): number {
  let width = 2 // padding left + right
  width += 2 // mark letters column (2 chars)
  width += 2 // change indicator dot + space
  if (v.state) width += COL.state // icon + space
  if (v.checks) width += COL.checks // icon + space
  if (v.review) width += COL.review + 1 // icon + space
  if (v.comments) width += COL.comments + 1 // comments + space
  if (v.time) width += COL.time + 1 // time + space
  if (v.author) width += COL.author + 1 // space + author
  if (v.repo) width += COL.repo + 1 // space + repo
  return width
}

/** Unicode icons */
const ICONS = {
  // PR state icons
  prOpen: "○",      // open circle
  prDraft: "◌",     // dotted circle
  prMerged: "●",    // filled circle
  prClosed: "✗",    // x mark
  // CI check icons
  checkSuccess: "✓", // check mark
  checkFailure: "✗", // x mark
  checkPending: "*", // asterisk for pending
  checkNone: "-",    // dash
  // Review icons
  reviewApproved: "✓", // check mark
  reviewChanges: "!",  // exclamation
  reviewRequired: "?", // question mark
  reviewNone: "-",     // dash
}

interface PRListProps {
  prs: PR[]
  selectedIndex: number
  columnVisibility: ColumnVisibility
  previewPosition: "right" | "bottom" | null
  history: History
  /** Custom message when list is empty */
  emptyMessage?: string
  /** Secondary hint when list is empty */
  emptyHint?: string
}

// Number of lines to keep visible above/below cursor when scrolling
const SCROLL_MARGIN = 3

export function PRList({ prs, selectedIndex, columnVisibility, previewPosition, history, emptyMessage, emptyHint }: PRListProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { width: terminalWidth } = useTerminalDimensions()

  // Scroll to keep selected item visible with margin
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const viewportHeight = scrollbox.viewport?.height ?? 20
    const scrollTop = scrollbox.scrollTop
    const scrollBottom = scrollTop + viewportHeight

    // Check if selected is above visible area (with margin)
    if (selectedIndex < scrollTop + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, selectedIndex - SCROLL_MARGIN))
    }
    // Check if selected is below visible area (with margin)
    else if (selectedIndex >= scrollBottom - SCROLL_MARGIN) {
      scrollbox.scrollTo(selectedIndex - viewportHeight + SCROLL_MARGIN + 1)
    }
  }, [selectedIndex])

  if (prs.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
        <text fg={theme.textDim}>{emptyMessage ?? "No pull requests found"}</text>
        {emptyHint && <text fg={theme.textMuted}>{emptyHint}</text>}
      </box>
    )
  }

  // Calculate available title width (account for preview panel taking 50% when on right)
  const listWidth = previewPosition === "right" ? Math.floor(terminalWidth / 2) : terminalWidth
  const fixedWidth = getFixedColumnsWidth(columnVisibility)
  const titleWidth = Math.max(10, listWidth - fixedWidth)

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      <PRHeaderRow columnVisibility={columnVisibility} titleWidth={titleWidth} />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {prs.map((pr, index) => (
          <PRRow
            key={`${getRepoName(pr)}#${pr.number}`}
            pr={pr}
            selected={index === selectedIndex}
            columnVisibility={columnVisibility}
            titleWidth={titleWidth}
            history={history}
          />
        ))}
      </scrollbox>
    </box>
  )
}

/** Header row with column labels */
function PRHeaderRow({ columnVisibility, titleWidth }: { columnVisibility: ColumnVisibility; titleWidth: number }) {
  const v = columnVisibility
  
  return (
    <box
      height={1}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={theme.textDim}>
        {"  "}{/* space for mark letters column (2 chars) */}
        {"  "}{/* space for dot column (2 chars: dot + space) */}
        {v.state && "S "}
        {v.checks && "C "}
        {v.review && "R "}
        {v.comments && padRight("#", COL.comments)}
        {v.comments && " "}
        {v.time && padRight("", COL.time)}
        {v.time && " "}
        {padRight("Title", titleWidth)}
        {v.author && " "}
        {v.author && padRight("Author", COL.author)}
        {v.repo && " "}
        {v.repo && padRight("Repo", COL.repo)}
      </text>
    </box>
  )
}

interface PRRowProps {
  pr: PR
  selected: boolean
  columnVisibility: ColumnVisibility
  titleWidth: number
  history: History
}

function PRRow({ pr, selected, columnVisibility, titleWidth, history }: PRRowProps) {
  const v = columnVisibility
  const stateIndicator = getStateIndicator(pr)
  const checkIndicator = getCheckIndicator(computeCheckState(pr.statusCheckRollup))
  const reviewIndicator = getReviewIndicator(pr.reviewDecision)
  const commentCount = formatCommentCount(pr.commentCount)
  const timeAgo = formatRelativeTime(pr.updatedAt).replace(" ago", "")
  const repoName = getShortRepoName(pr)
  const prId = `#${pr.number}`
  const author = `@${pr.author.login}`
  
  // Check marked/recent/changed status
  const prKey = getPRKey(getRepoName(pr), pr.number)
  const isMarked = isPRMarked(history, prKey)
  const markLetter = getPRMark(history, prKey)
  const hasChanges = prHasChanges(history, prKey)
  
  // Title color: marked PRs get gold, everything else gets base text color.
  // The unread dot and mark letters handle visual differentiation (spec 029).
  const titleColor = isMarked ? theme.warning : theme.text
  
  // Title with PR number suffix: "Fix the bug (#123)"
  const prSuffix = ` (${prId})`
  const titleTextWidth = titleWidth - prSuffix.length
  const title = truncate(pr.title, titleTextWidth)

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {/* Mark letter column (2 chars: letter + space) */}
        {markLetter ? (
          <><span fg={getMarkColor(markLetter)}>{markLetter}</span><span>{" "}</span></>
        ) : (
          <span>{"  "}</span>
        )}
        {/* Change indicator dot */}
        <span fg={hasChanges ? theme.primary : undefined}>{hasChanges ? "• " : "  "}</span>
        {v.state && <span fg={stateIndicator.color}>{stateIndicator.icon}</span>}
        {v.state && " "}
        {v.checks && <span fg={checkIndicator.color}>{checkIndicator.icon}</span>}
        {v.checks && " "}
        {v.review && <span fg={reviewIndicator.color}>{reviewIndicator.icon}</span>}
        {v.review && " "}
        {v.comments && <span fg={pr.commentCount > 0 ? theme.textMuted : theme.textMuted}>{padRight(commentCount, COL.comments)}</span>}
        {v.comments && " "}
        {v.time && <span fg={theme.textMuted}>{padRight(timeAgo, COL.time)}</span>}
        {v.time && " "}
        <span fg={titleColor}>{title}</span>
        <span fg={theme.textDim}>{prSuffix}</span>
        <span>{" ".repeat(Math.max(0, titleTextWidth - title.length))}</span>
        {v.author && " "}
        {v.author && <span fg={theme.textMuted}>{padRight(truncate(author, COL.author), COL.author)}</span>}
        {v.repo && " "}
        {v.repo && <span fg={theme.primary}>{padRight(truncate(repoName, COL.repo), COL.repo)}</span>}
      </text>
    </box>
  )
}

/** Get state indicator for PR (Open/Draft/Merged/Closed) */
function getStateIndicator(pr: PR): { icon: string; color: string } {
  switch (pr.state) {
    case "MERGED":
      return { icon: ICONS.prMerged, color: theme.prMerged }
    case "CLOSED":
      return { icon: ICONS.prClosed, color: theme.prClosed }
    case "OPEN":
    default:
      if (pr.isDraft) {
        return { icon: ICONS.prDraft, color: theme.prDraft }
      }
      return { icon: ICONS.prOpen, color: theme.prOpen }
  }
}

/** Get CI check status indicator */
function getCheckIndicator(state: CheckState): { icon: string; color: string } {
  switch (state) {
    case "SUCCESS":
      return { icon: ICONS.checkSuccess, color: theme.success }
    case "FAILURE":
      return { icon: ICONS.checkFailure, color: theme.error }
    case "PENDING":
      return { icon: ICONS.checkPending, color: theme.warning }
    case "NONE":
    default:
      return { icon: ICONS.checkNone, color: theme.textMuted }
  }
}

/** Get review status indicator */
function getReviewIndicator(decision?: ReviewDecision | null): { icon: string; color: string } {
  switch (decision) {
    case "APPROVED":
      return { icon: ICONS.reviewApproved, color: theme.success }
    case "CHANGES_REQUESTED":
      return { icon: ICONS.reviewChanges, color: theme.error }
    case "REVIEW_REQUIRED":
      return { icon: ICONS.reviewRequired, color: theme.warning }
    default:
      return { icon: ICONS.reviewNone, color: theme.textMuted }
  }
}

/** Pad string to the right (left-align) */
function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return text + " ".repeat(width - text.length)
}

/** Format comment count for display */
function formatCommentCount(count: number): string {
  if (count === 0) return "-"
  if (count > 99) return "99+"
  return String(count)
}
