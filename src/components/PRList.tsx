/**
 * PR List component - displays pull requests in a table-like layout
 * 
 * Column order: State | Checks | Review | Base | Merge | Time | Title (flex) | Author | Repo
 *
 * The four status columns collapse to State + Merge when the list is too narrow to
 * afford them — the merge verdict is the summary, the rest is the detail (spec 036).
 * Title column format: #1234 PR title here...
 */

import { useRef, useEffect } from "react"
import { useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { theme, getMarkColor } from "../theme"
import type { PR, ColumnVisibility, PendingAction } from "../types"
import { getRepoName, getShortRepoName, getPRCheckState, computeMergeVerdict } from "../types"
import { getStateIndicator, getCheckIndicator, getReviewIndicator, getSyncIndicator, getMergeIndicator } from "../status"
import { formatRelativeTime } from "../utils/time"
import { truncate } from "../utils/string"
import { getPRKey, isPRMarked, getPRMark, type History } from "../history"
import { prHasChanges } from "../notifications"

/** Column widths for table-like layout */
const COL = {
  state: 2,      // icon + space
  checks: 2,     // icon + space
  review: 1,     // icon (no trailing space)
  sync: 1,       // icon (no trailing space)
  merge: 1,      // icon (no trailing space)
  comments: 3,   // comment count (e.g. "12" or "99+")
  time: 4,       // "1d" or "2mo" (without "ago")
  repo: 16,      // Short repo name
  author: 16,    // @username
  // title: remaining space (includes PR number prefix)
}

/**
 * Which status columns are actually drawn. "compact" keeps only the state icon and the
 * merge verdict; the gates that explain the verdict are dropped.
 */
export type GateMode = "full" | "compact"

/** Below this the title stops being readable, so the gate detail goes instead */
const MIN_TITLE_WIDTH = 32

/**
 * Column visibility is a mask, never an override: collapsing hides gate columns but
 * cannot bring back one the user turned off.
 */
function isGateVisible(v: ColumnVisibility, mode: GateMode, column: "checks" | "review" | "sync"): boolean {
  return v[column] && mode === "full"
}

/** Calculate total fixed width (everything except title) */
function getFixedColumnsWidth(v: ColumnVisibility, mode: GateMode): number {
  let width = 2 // padding left + right
  width += 2 // mark letters column (2 chars)
  width += 2 // change indicator dot + space
  if (v.state) width += COL.state // icon + space
  if (isGateVisible(v, mode, "checks")) width += COL.checks // icon + space
  if (isGateVisible(v, mode, "review")) width += COL.review + 1 // icon + space
  if (isGateVisible(v, mode, "sync")) width += COL.sync + 1 // icon + space
  if (v.merge) width += COL.merge + 1 // icon + space
  if (v.comments) width += COL.comments + 1 // comments + space
  if (v.time) width += COL.time + 1 // time + space
  if (v.author) width += COL.author + 1 // space + author
  if (v.repo) width += COL.repo + 1 // space + repo
  return width
}

interface PRListProps {
  prs: PR[]
  selectedIndex: number
  columnVisibility: ColumnVisibility
  previewPosition: "right" | "bottom" | null
  history: History
  /** In-flight actions keyed by PR key (spec 036) */
  pendingActions: Record<string, PendingAction>
  /** User's expand/collapse preference for the gate columns (spec 037) */
  gateDetail: boolean
  /** Custom message when list is empty */
  emptyMessage?: string
  /** Secondary hint when list is empty */
  emptyHint?: string
}

// Number of lines to keep visible above/below cursor when scrolling
const SCROLL_MARGIN = 3

export function PRList({ prs, selectedIndex, columnVisibility, previewPosition, history, pendingActions, gateDetail, emptyMessage, emptyHint }: PRListProps) {
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
  // The toggle is the preference; width only overrides it when expanding would leave the
  // title unreadable, so `c` never silently produces a useless list.
  const fitsFullGates = listWidth - getFixedColumnsWidth(columnVisibility, "full") >= MIN_TITLE_WIDTH
  const gateMode: GateMode = gateDetail && fitsFullGates ? "full" : "compact"
  const fixedWidth = getFixedColumnsWidth(columnVisibility, gateMode)
  const titleWidth = Math.max(10, listWidth - fixedWidth)

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      <PRHeaderRow columnVisibility={columnVisibility} gateMode={gateMode} titleWidth={titleWidth} />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {prs.map((pr, index) => (
          <PRRow
            key={`${getRepoName(pr)}#${pr.number}`}
            pr={pr}
            selected={index === selectedIndex}
            columnVisibility={columnVisibility}
            gateMode={gateMode}
            titleWidth={titleWidth}
            history={history}
            pendingActions={pendingActions}
          />
        ))}
      </scrollbox>
    </box>
  )
}

/** Header row with column labels */
function PRHeaderRow({ columnVisibility, gateMode, titleWidth }: { columnVisibility: ColumnVisibility; gateMode: GateMode; titleWidth: number }) {
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
        {isGateVisible(v, gateMode, "checks") && "C "}
        {isGateVisible(v, gateMode, "review") && "R "}
        {isGateVisible(v, gateMode, "sync") && "B "}
        {v.merge && "M "}
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
  gateMode: GateMode
  titleWidth: number
  history: History
  pendingActions: Record<string, PendingAction>
}

function PRRow({ pr, selected, columnVisibility, gateMode, titleWidth, history, pendingActions }: PRRowProps) {
  const v = columnVisibility
  const stateIndicator = getStateIndicator(pr)
  const checkIndicator = getCheckIndicator(getPRCheckState(pr))
  const reviewIndicator = getReviewIndicator(pr)
  const syncIndicator = getSyncIndicator(pr)
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
  const mergeIndicator = getMergeIndicator(computeMergeVerdict(pr, prKey in pendingActions))
  
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
        {isGateVisible(v, gateMode, "checks") && <span fg={checkIndicator.color}>{checkIndicator.icon}</span>}
        {isGateVisible(v, gateMode, "checks") && " "}
        {isGateVisible(v, gateMode, "review") && <span fg={reviewIndicator.color}>{reviewIndicator.icon}</span>}
        {isGateVisible(v, gateMode, "review") && " "}
        {isGateVisible(v, gateMode, "sync") && <span fg={syncIndicator.color}>{syncIndicator.icon}</span>}
        {isGateVisible(v, gateMode, "sync") && " "}
        {v.merge && <span fg={mergeIndicator.color}>{mergeIndicator.icon}</span>}
        {v.merge && " "}
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
