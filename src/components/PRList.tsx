/**
 * PR List component - displays pull requests in a scrollable list
 */

import { theme } from "../theme"
import type { PR, CheckState, ReviewDecision } from "../types"
import { getRepoName, getShortRepoName } from "../types"
import { formatRelativeTime } from "../utils/time"

interface PRListProps {
  prs: PR[]
  selectedIndex: number
}

export function PRList({ prs, selectedIndex }: PRListProps) {
  if (prs.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={theme.textDim}>No pull requests found</text>
      </box>
    )
  }

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      {prs.map((pr, index) => (
        <PRRow
          key={`${getRepoName(pr)}#${pr.number}`}
          pr={pr}
          selected={index === selectedIndex}
        />
      ))}
    </box>
  )
}

interface PRRowProps {
  pr: PR
  selected: boolean
}

function PRRow({ pr, selected }: PRRowProps) {
  const stateIndicator = getStateIndicator(pr)
  const checkIndicator = getCheckIndicator(pr.statusCheckRollup?.state)
  const reviewIndicator = getReviewIndicator(pr.reviewDecision)
  const timeAgo = formatRelativeTime(pr.updatedAt)

  // Get short repo name (just the repo part, not owner)
  const repoName = getShortRepoName(pr)

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {/* State indicator (O/M/C/D) */}
        <span fg={stateIndicator.color}>{stateIndicator.icon}</span>
        {" "}
        {/* CI status */}
        <span fg={checkIndicator.color}>{checkIndicator.icon}</span>
        {" "}
        {/* Review status */}
        <span fg={reviewIndicator.color}>{reviewIndicator.icon}</span>
        {"  "}
        {/* PR number */}
        <span fg={theme.textDim}>#{pr.number}</span>
        {" "}
        {/* Title */}
        <span fg={theme.text}>{truncate(pr.title, 50)}</span>
        {"  "}
        {/* Repo */}
        <span fg={theme.textMuted}>{repoName}</span>
        {"  "}
        {/* Author */}
        <span fg={theme.textMuted}>@{pr.author.login}</span>
        {"  "}
        {/* Time */}
        <span fg={theme.textMuted}>{timeAgo}</span>
      </text>
    </box>
  )
}

/** Get state indicator for PR (Open/Merged/Closed/Draft) */
function getStateIndicator(pr: PR): { icon: string; color: string } {
  if (pr.isDraft) {
    return { icon: "D", color: theme.prDraft }
  }
  switch (pr.state) {
    case "MERGED":
      return { icon: "M", color: theme.prMerged }
    case "CLOSED":
      return { icon: "C", color: theme.prClosed }
    case "OPEN":
    default:
      return { icon: "O", color: theme.prOpen }
  }
}

/** Get CI check status indicator */
function getCheckIndicator(state?: CheckState): { icon: string; color: string } {
  switch (state) {
    case "SUCCESS":
      return { icon: "+", color: theme.success }
    case "FAILURE":
    case "ERROR":
      return { icon: "x", color: theme.error }
    case "PENDING":
      return { icon: "o", color: theme.warning }
    default:
      return { icon: "-", color: theme.textMuted }
  }
}

/** Get review status indicator */
function getReviewIndicator(decision?: ReviewDecision | null): { icon: string; color: string } {
  switch (decision) {
    case "APPROVED":
      return { icon: "+", color: theme.success }
    case "CHANGES_REQUESTED":
      return { icon: "!", color: theme.error }
    case "REVIEW_REQUIRED":
      return { icon: "?", color: theme.warning }
    default:
      return { icon: "-", color: theme.textMuted }
  }
}

/** Truncate text to max length */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + "…"
}
