/**
 * PR List component - displays pull requests in a table-like layout
 * 
 * Column order: State | Draft | Checks | Review | Time | Repo | Author | ID | Title
 */

import { useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { theme } from "../theme"
import type { PR, CheckState, ReviewDecision, ColumnVisibility } from "../types"
import { getRepoName, getShortRepoName, computeCheckState } from "../types"
import { formatRelativeTime } from "../utils/time"

/** Column widths for table-like layout */
const COL = {
  state: 1,      // Nerd font icon
  checks: 1,     // Nerd font icon
  review: 1,     // Nerd font icon
  time: 9,       // "just now" or "12h ago"
  id: 6,         // #1234
  repo: 16,      // Short repo name
  author: 16,    // @username
  // title: remaining space
}

/** Unicode icons */
const ICONS = {
  // Combined PR state icons (includes draft)
  prOpen: "○",      // open circle (ready for review)
  prDraft: "◌",     // dotted circle (draft)
  prMerged: "●",    // filled circle (merged)
  prClosed: "✗",    // x mark (closed)
  // CI check icons
  checkSuccess: "✓", // check mark
  checkFailure: "✗", // x mark
  checkPending: "◔", // circle with upper right quadrant
  checkNone: "─",    // horizontal line
  // Review icons
  reviewApproved: "✓", // check mark
  reviewChanges: "!",  // exclamation
  reviewRequired: "?", // question mark
  reviewNone: "─",     // horizontal line
}

interface PRListProps {
  prs: PR[]
  selectedIndex: number
  columnVisibility: ColumnVisibility
}

// Number of lines to keep visible above/below cursor when scrolling
const SCROLL_MARGIN = 3

export function PRList({ prs, selectedIndex, columnVisibility }: PRListProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

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
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={theme.textDim}>No pull requests found</text>
      </box>
    )
  }

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      <PRHeaderRow columnVisibility={columnVisibility} />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {prs.map((pr, index) => (
          <PRRow
            key={`${getRepoName(pr)}#${pr.number}`}
            pr={pr}
            selected={index === selectedIndex}
            columnVisibility={columnVisibility}
          />
        ))}
      </scrollbox>
    </box>
  )
}

/** Header row with column labels */
function PRHeaderRow({ columnVisibility }: { columnVisibility: ColumnVisibility }) {
  const v = columnVisibility
  return (
    <box
      height={1}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text fg={theme.textDim}>
        {/* State (combined with draft) */}
        {v.state && "S"}
        {v.state && " "}
        {/* Checks */}
        {v.checks && "C"}
        {v.checks && " "}
        {/* Review */}
        {v.review && "R"}
        {v.review && "  "}
        {/* Time */}
        {v.time && padLeft("Updated", COL.time)}
        {v.time && "  "}
        {/* Repo */}
        {v.repo && padRight("Repository", COL.repo)}
        {v.repo && " "}
        {/* Author */}
        {v.author && padRight("Author", COL.author)}
        {v.author && " "}
        {/* ID */}
        {v.id && padRight("PR", COL.id)}
        {v.id && " "}
        {/* Title - always visible */}
        {"Title"}
      </text>
    </box>
  )
}

interface PRRowProps {
  pr: PR
  selected: boolean
  columnVisibility: ColumnVisibility
}

function PRRow({ pr, selected, columnVisibility }: PRRowProps) {
  const v = columnVisibility
  const stateIndicator = getStateIndicator(pr)
  const checkIndicator = getCheckIndicator(computeCheckState(pr.statusCheckRollup))
  const reviewIndicator = getReviewIndicator(pr.reviewDecision)
  const timeAgo = formatRelativeTime(pr.updatedAt)
  const repoName = getShortRepoName(pr)
  const prId = `#${pr.number}`
  const author = `@${pr.author.login}`

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {/* State (Open/Draft/Merged/Closed) */}
        {v.state && <span fg={stateIndicator.color}>{stateIndicator.icon}</span>}
        {v.state && " "}
        {/* Checks */}
        {v.checks && <span fg={checkIndicator.color}>{checkIndicator.icon}</span>}
        {v.checks && " "}
        {/* Review */}
        {v.review && <span fg={reviewIndicator.color}>{reviewIndicator.icon}</span>}
        {v.review && "  "}
        {/* Time - right-aligned in fixed width */}
        {v.time && <span fg={theme.textMuted}>{padLeft(timeAgo, COL.time)}</span>}
        {v.time && "  "}
        {/* Repo - fixed width */}
        {v.repo && <span fg={theme.primary}>{padRight(truncate(repoName, COL.repo), COL.repo)}</span>}
        {v.repo && " "}
        {/* Author - fixed width */}
        {v.author && <span fg={theme.textMuted}>{padRight(truncate(author, COL.author), COL.author)}</span>}
        {v.author && " "}
        {/* PR ID */}
        {v.id && <span fg={theme.textDim}>{padRight(prId, COL.id)}</span>}
        {v.id && " "}
        {/* Title - takes remaining space */}
        <span fg={theme.text}>{pr.title}</span>
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
      // Draft is a sub-state of Open
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

/** Truncate text to max length */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}

/** Pad string to the right (left-align) */
function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return text + " ".repeat(width - text.length)
}

/** Pad string to the left (right-align) */
function padLeft(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return " ".repeat(width - text.length) + text
}
