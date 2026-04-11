/**
 * Command palette - unified interface for filters and actions
 * Opens with Ctrl-p, fuzzy search commands, execute with Enter
 * 
 * Styling based on riff's ActionMenu (Catppuccin-inspired overlay)
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"
import {
  getAvailableCommands,
  groupCommands,
  formatCategory,
  getRepoMergeSettings,
  getPRMergeState,
  executeMerge,
  type Command,
  type CommandContext,
  type CommandResult,
  type MergeMethod,
  type RepoMergeSettings,
  type PRMergeState,
} from "../commands"
import { fuzzyFilter } from "../utils/fuzzy"
import { getRepoName, getShortRepoName } from "../types"
import { submitPRReview, type ReviewEvent } from "../actions/review"

interface CommandPaletteProps {
  visible: boolean
  context: CommandContext
  onClose: () => void
  onResult: (result: CommandResult) => void
}

/** Merge method option */
interface MergeOption {
  method: MergeMethod
  label: string
  number: number // 1, 2, or 3
}

/** Merge dialog state */
interface MergeDialogState {
  options: MergeOption[]
  selectedMethod: MergeMethod | null // null = no selection yet
  mergeable: boolean
  mergeableState: string
}

/** Rename tab dialog state */
interface RenameDialogState {
  currentName: string
  newName: string
}

/** Submit-review dialog state */
interface ReviewDialogState {
  event: ReviewEvent
  body: string
  submitting: boolean
  error: string | null
}

export function CommandPalette({
  visible,
  context,
  onClose,
  onResult,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirming, setConfirming] = useState<Command | null>(null)
  const [executing, setExecuting] = useState(false)
  // Merge dialog state
  const [mergeDialog, setMergeDialog] = useState<MergeDialogState | null>(null)
  const [loadingMergeOptions, setLoadingMergeOptions] = useState(false)
  // Rename tab dialog state
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null)
  // Review dialog state (spec 031)
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null)

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
      setConfirming(null)
      setExecuting(false)
      setMergeDialog(null)
      setLoadingMergeOptions(false)
      setRenameDialog(null)
      setReviewDialog(null)
    }
  }, [visible])

  // Get available commands and filter by query
  const availableCommands = useMemo(
    () => getAvailableCommands(context),
    [context.selectedPR, context.columnVisibility]
  )

  const filteredCommands = useMemo(() => {
    if (!query) return availableCommands

    return fuzzyFilter(query, availableCommands, (cmd) => [
      cmd.label,
      cmd.shortcut ?? "",
      cmd.category,
    ])
  }, [availableCommands, query])

  const groupedCommands = useMemo(
    () => groupCommands(filteredCommands),
    [filteredCommands]
  )

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1))
    }
  }, [filteredCommands.length, selectedIndex])

  const handleExecute = async (cmd: Command) => {
    // If dangerous and not confirming, enter confirmation mode
    if (cmd.dangerous && confirming?.id !== cmd.id) {
      setConfirming(cmd)
      return
    }

    // Execute command
    setConfirming(null)
    setExecuting(true)

    try {
      const result = await cmd.execute(context)
      
      // Handle merge dialog
      if (result.type === "merge_dialog") {
        setExecuting(false)
        setLoadingMergeOptions(true)
        
        const pr = context.selectedPR!
        const repo = getRepoName(pr)
        
        // Fetch both repo settings and PR merge state in parallel
        const [settings, mergeState] = await Promise.all([
          getRepoMergeSettings(repo),
          getPRMergeState(repo, pr.number),
        ])
        
        // Build options with numbers (1, 2, 3)
        const options: MergeOption[] = []
        let num = 1
        if (settings.allowSquashMerge) {
          options.push({ method: "squash", label: "Squash and merge", number: num++ })
        }
        if (settings.allowMergeCommit) {
          options.push({ method: "merge", label: "Create a merge commit", number: num++ })
        }
        if (settings.allowRebaseMerge) {
          options.push({ method: "rebase", label: "Rebase and merge", number: num++ })
        }
        
        setLoadingMergeOptions(false)
        
        // Show dialog even if not mergeable (to show the reason)
        setMergeDialog({
          options,
          selectedMethod: null, // No default selection
          mergeable: mergeState.mergeable,
          mergeableState: mergeState.mergeableState,
        })
        return
      }
      
      // Handle review dialog (spec 031)
      if (result.type === "review_dialog") {
        setExecuting(false)
        setReviewDialog({
          event: "APPROVE",
          body: "",
          submitting: false,
          error: null,
        })
        return
      }

      // Handle rename tab dialog
      if (result.type === "rename_tab") {
        setExecuting(false)
        const activeTab = context.tabs.find(t => t.id === context.activeTabId)
        if (activeTab) {
          setRenameDialog({
            currentName: activeTab.titleOverride ?? activeTab.title,
            newName: activeTab.titleOverride ?? activeTab.title,
          })
        }
        return
      }
      
      onClose()
      onResult(result)
    } catch (err) {
      onClose()
      onResult({ type: "error", message: String(err) })
    }
  }
  
  const handleSubmitReview = async (state: ReviewDialogState) => {
    const pr = context.selectedPR!
    setReviewDialog({ ...state, submitting: true, error: null })

    const result = await submitPRReview(pr, state.event, state.body)

    if (result.success) {
      // Optimistic update of reviewDecision so the row reflects the new state
      if (state.event === "APPROVE") {
        context.dispatch({
          type: "UPDATE_PR",
          url: pr.url,
          updates: { reviewDecision: "APPROVED" },
        })
      } else if (state.event === "REQUEST_CHANGES") {
        context.dispatch({
          type: "UPDATE_PR",
          url: pr.url,
          updates: { reviewDecision: "CHANGES_REQUESTED" },
        })
      }
      setReviewDialog(null)
      onClose()
      onResult({ type: "success", message: result.message })
    } else {
      // Keep dialog open so the user can retry / tweak the body
      setReviewDialog({ ...state, submitting: false, error: result.message })
    }
  }

  const handleMerge = async (method: MergeMethod) => {
    const pr = context.selectedPR!
    const repo = getRepoName(pr)
    
    setMergeDialog(null)
    setExecuting(true)
    
    const result = await executeMerge(pr, repo, method, context.dispatch)
    onClose()
    onResult(result.success 
      ? { type: "success", message: result.message }
      : { type: "error", message: result.message }
    )
  }

  useKeyboard((key) => {
    if (!visible) return

    // Rename dialog mode
    if (renameDialog) {
      if (key.name === "escape") {
        setRenameDialog(null)
        onClose()
      } else if (key.name === "return") {
        // Save and close
        const newName = renameDialog.newName.trim()
        context.dispatch({ 
          type: "RENAME_TAB", 
          tabId: context.activeTabId, 
          title: newName 
        })
        setRenameDialog(null)
        onClose()
        onResult({ type: "success", message: newName ? `Renamed to "${newName}"` : "Tab name reset" })
      } else if (key.name === "backspace") {
        setRenameDialog({ ...renameDialog, newName: renameDialog.newName.slice(0, -1) })
      } else if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta
      ) {
        setRenameDialog({ ...renameDialog, newName: renameDialog.newName + key.sequence })
      }
      return
    }

    // Review dialog mode (spec 031)
    if (reviewDialog) {
      if (reviewDialog.submitting) return

      if (key.name === "escape") {
        setReviewDialog(null)
        onClose()
        return
      }

      // 1/2/3 select event type
      if (key.name === "1") {
        setReviewDialog({ ...reviewDialog, event: "COMMENT", error: null })
        return
      }
      if (key.name === "2") {
        setReviewDialog({ ...reviewDialog, event: "APPROVE", error: null })
        return
      }
      if (key.name === "3") {
        setReviewDialog({ ...reviewDialog, event: "REQUEST_CHANGES", error: null })
        return
      }

      if (key.name === "return") {
        // Validate: non-APPROVE events require a body
        const needsBody = reviewDialog.event !== "APPROVE"
        if (needsBody && reviewDialog.body.trim() === "") {
          setReviewDialog({
            ...reviewDialog,
            error:
              reviewDialog.event === "REQUEST_CHANGES"
                ? "Request changes requires a comment body"
                : "Comment requires a body",
          })
          return
        }
        handleSubmitReview(reviewDialog)
        return
      }

      // Ctrl+J inserts a literal newline
      if (key.ctrl && key.name === "j") {
        setReviewDialog({
          ...reviewDialog,
          body: reviewDialog.body + "\n",
          error: null,
        })
        return
      }

      if (key.name === "backspace") {
        setReviewDialog({
          ...reviewDialog,
          body: reviewDialog.body.slice(0, -1),
          error: null,
        })
        return
      }

      if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta
      ) {
        setReviewDialog({
          ...reviewDialog,
          body: reviewDialog.body + key.sequence,
          error: null,
        })
      }
      return
    }

    // Merge dialog mode
    if (mergeDialog) {
      if (key.name === "escape") {
        setMergeDialog(null)
        onClose()
      } else if (key.name === "return") {
        // Only merge if a method is selected and PR is mergeable
        if (mergeDialog.selectedMethod && mergeDialog.mergeable) {
          handleMerge(mergeDialog.selectedMethod)
        }
      } else if (key.name === "1" || key.name === "2" || key.name === "3") {
        // Number key selects method
        const num = parseInt(key.name)
        const option = mergeDialog.options.find(o => o.number === num)
        if (option && mergeDialog.mergeable) {
          setMergeDialog({ ...mergeDialog, selectedMethod: option.method })
        }
      }
      return
    }

    // Confirmation mode - Y to confirm, n/Escape to cancel
    if (confirming) {
      if (key.name === "y" || key.name === "Y") {
        handleExecute(confirming)
      } else if (key.name === "n" || key.name === "N" || key.name === "escape") {
        setConfirming(null)
      }
      return
    }

    // Executing - ignore input
    if (executing) return

    // Normal mode
    if (key.name === "escape") {
      onClose()
    } else if (key.name === "return") {
      if (filteredCommands[selectedIndex]) {
        handleExecute(filteredCommands[selectedIndex])
      }
    } else if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
      setSelectedIndex((i) => Math.min(filteredCommands.length - 1, i + 1))
    } else if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1))
      setSelectedIndex(0)
    } else if (
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta
    ) {
      setQuery((q) => q + key.sequence)
      setSelectedIndex(0)
    }
  })

  if (!visible) return null

  // Build flat list for index tracking
  const flatList: { cmd: Command; category: string }[] = []
  for (const [category, cmds] of Object.entries(groupedCommands)) {
    for (const cmd of cmds) {
      flatList.push({ cmd, category })
    }
  }

  // Confirmation view
  if (confirming) {
    const pr = context.selectedPR
    return (
      <box
        id="command-palette-overlay"
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
      >
        {/* Dim background */}
        <box
          width="100%"
          height="100%"
          position="absolute"
          top={0}
          left={0}
          backgroundColor={theme.overlayBg}
        />
        {/* Confirmation dialog */}
        <box
          position="absolute"
          top={2}
          left="25%"
          width="50%"
          flexDirection="column"
          backgroundColor={theme.modalBg}
        >
          {/* Header */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
          >
            <text fg={theme.warning}>Confirm Action</text>
          </box>
          {/* Message */}
          <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="column">
            <box height={1}>
              <text>
                <span fg={theme.text}>{confirming.label}</span>
                <span fg={theme.textDim}> #{pr?.number}</span>
              </text>
            </box>
            <box height={1}>
              <text fg={theme.textDim}>{pr?.title}</text>
            </box>
            <box height={1} marginTop={1}>
              <text>
                <span fg={theme.primary}>@{pr?.author.login}</span>
                <span fg={theme.textMuted}> · {pr ? getShortRepoName(pr) : ""}</span>
              </text>
            </box>
          </box>
          {/* Footer */}
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <text>
              <span fg={theme.success}>Y</span>
              <span fg={theme.textMuted}>es / </span>
              <span fg={theme.error}>n</span>
              <span fg={theme.textMuted}>o</span>
            </text>
          </box>
        </box>
      </box>
    )
  }

  // Rename tab dialog view
  if (renameDialog) {
    return (
      <box
        id="command-palette-overlay"
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
      >
        {/* Dim background */}
        <box
          width="100%"
          height="100%"
          position="absolute"
          top={0}
          left={0}
          backgroundColor={theme.overlayBg}
        />
        {/* Rename dialog */}
        <box
          position="absolute"
          top={2}
          left="25%"
          width="50%"
          flexDirection="column"
          backgroundColor={theme.modalBg}
        >
          {/* Header */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
          >
            <text fg={theme.primary}>Rename Tab</text>
            <text fg={theme.textMuted}>esc</text>
          </box>
          {/* Input */}
          <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
            <text>
              {renameDialog.newName ? (
                <span fg={theme.text}>{renameDialog.newName}</span>
              ) : (
                <span fg={theme.textMuted}>Enter name (empty to reset)</span>
              )}
              <span fg={theme.primary}>_</span>
            </text>
          </box>
          {/* Footer */}
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <text>
              <span fg={theme.success}>Enter</span>
              <span fg={theme.textMuted}> to save</span>
            </text>
          </box>
        </box>
      </box>
    )
  }

  // Review dialog view (spec 031) — styled to match riff's ReviewPreview
  if (reviewDialog) {
    const types: { key: "1" | "2" | "3"; event: ReviewEvent; label: string; color: string }[] = [
      { key: "1", event: "COMMENT", label: "Comment", color: theme.primary },
      { key: "2", event: "APPROVE", label: "Approve", color: theme.success },
      { key: "3", event: "REQUEST_CHANGES", label: "Request Changes", color: theme.warning },
    ]
    const selectedColor =
      types.find((t) => t.event === reviewDialog.event)?.color ?? theme.primary
    const bodyLines = reviewDialog.body.length > 0 ? reviewDialog.body.split("\n") : [""]
    const needsBody = reviewDialog.event !== "APPROVE"
    const submitAllowed =
      !reviewDialog.submitting && !(needsBody && reviewDialog.body.trim() === "")

    // Footer hint (left side)
    const hint = reviewDialog.error
      ? reviewDialog.error
      : reviewDialog.submitting
        ? "Submitting..."
        : !submitAllowed
          ? "Add a comment or summary"
          : "Ctrl+J: newline"
    const hintColor = reviewDialog.error
      ? theme.error
      : reviewDialog.submitting
        ? theme.warning
        : !submitAllowed
          ? theme.warning
          : theme.textMuted

    return (
      <box
        id="command-palette-overlay"
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
      >
        {/* Dim background */}
        <box
          width="100%"
          height="100%"
          position="absolute"
          top={0}
          left={0}
          backgroundColor={theme.overlayBg}
        />
        {/* Review dialog */}
        <box
          position="absolute"
          top={2}
          left="25%"
          width="50%"
          flexDirection="column"
          backgroundColor={theme.modalBg}
        >
          {/* Header */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={theme.headerBg}
          >
            <text fg={theme.text}>Submit Review</text>
            <text fg={theme.textDim}>Esc to close</text>
          </box>

          {/* Type selector */}
          <box
            flexDirection="row"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            gap={3}
          >
            {types.map((t) => {
              const isSelected = reviewDialog.event === t.event
              return (
                <box
                  key={t.event}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected ? t.color : undefined}
                >
                  <text fg={isSelected ? theme.bg : theme.textDim}>
                    {t.key}: {t.label}
                  </text>
                </box>
              )
            })}
          </box>

          {/* Summary input */}
          <box
            flexDirection="column"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
          >
            <box height={1}>
              <text fg={theme.text}>Summary (editing)</text>
            </box>
            <box
              marginTop={1}
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              border={["top", "bottom", "left", "right"]}
              borderStyle="single"
              borderColor={theme.textDim}
              flexDirection="column"
              minHeight={4}
            >
              {reviewDialog.body.length === 0 ? (
                <box height={1}>
                  <text>
                    <span fg={theme.text} bg={theme.textDim}> </span>
                  </text>
                </box>
              ) : (
                bodyLines.map((line, i) => {
                  const isLast = i === bodyLines.length - 1
                  return (
                    <box key={i} height={1}>
                      <text>
                        <span fg={theme.text}>{line}</span>
                        {isLast && <span fg={theme.text} bg={theme.textDim}> </span>}
                      </text>
                    </box>
                  )
                })
              )}
            </box>
          </box>

          {/* Footer */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={theme.headerBg}
          >
            <text fg={hintColor}>{hint}</text>
            <box
              paddingLeft={2}
              paddingRight={2}
              backgroundColor={submitAllowed ? selectedColor : theme.textMuted}
            >
              <text fg={submitAllowed ? theme.bg : theme.textDim}>Enter</text>
            </box>
          </box>
        </box>
      </box>
    )
  }

  // Merge method selection view
  if (mergeDialog || loadingMergeOptions) {
    const pr = context.selectedPR
    const canMerge = mergeDialog?.mergeable ?? false
    const mergeBlockedReason = mergeDialog && !mergeDialog.mergeable
      ? getMergeBlockedReason(mergeDialog.mergeableState)
      : null
    
    return (
      <box
        id="command-palette-overlay"
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
      >
        {/* Dim background */}
        <box
          width="100%"
          height="100%"
          position="absolute"
          top={0}
          left={0}
          backgroundColor={theme.overlayBg}
        />
        {/* Merge dialog */}
        <box
          position="absolute"
          top={2}
          left="25%"
          width="50%"
          flexDirection="column"
          backgroundColor={theme.modalBg}
        >
          {/* Header */}
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <text fg={theme.primary}>Merge PR</text>
          </box>
          {/* PR info */}
          <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="column">
            <box height={1}>
              <text>
                <span fg={theme.textDim}>#{pr?.number} </span>
                <span fg={theme.text}>{pr?.title}</span>
              </text>
            </box>
            <box height={1}>
              <text>
                <span fg={theme.primary}>@{pr?.author.login}</span>
                <span fg={theme.textMuted}> · {pr ? getShortRepoName(pr) : ""}</span>
              </text>
            </box>
          </box>
          {/* Not mergeable warning */}
          {mergeBlockedReason && (
            <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
              <text fg={theme.error}>✗ {mergeBlockedReason}</text>
            </box>
          )}
          {/* Loading or options */}
          {loadingMergeOptions ? (
            <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
              <text fg={theme.textMuted}>Loading...</text>
            </box>
          ) : (
            <box flexDirection="row" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={2}>
              {mergeDialog?.options.map((option) => {
                const isSelected = mergeDialog.selectedMethod === option.method
                const isDisabled = !canMerge
                const bg = isSelected ? theme.primary : undefined
                const fg = isDisabled 
                  ? theme.textMuted 
                  : isSelected 
                    ? theme.bg 
                    : theme.text
                return (
                  <box key={option.method} paddingLeft={1} paddingRight={1} backgroundColor={bg}>
                    <text fg={fg}>
                      {option.number}: {option.label}
                    </text>
                  </box>
                )
              })}
            </box>
          )}
          {/* Footer */}
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            {canMerge ? (
              <text>
                <span fg={theme.textMuted}>Press </span>
                <span fg={theme.warning}>1/2/3</span>
                <span fg={theme.textMuted}> to select · </span>
                <span fg={mergeDialog?.selectedMethod ? theme.success : theme.textMuted}>Enter</span>
                <span fg={theme.textMuted}> to merge · Esc cancel</span>
              </text>
            ) : (
              <text fg={theme.textMuted}>Esc to close</text>
            )}
          </box>
        </box>
      </box>
    )
  }

  // Executing view
  if (executing) {
    return (
      <box
        id="command-palette-overlay"
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
      >
        <box
          width="100%"
          height="100%"
          position="absolute"
          top={0}
          left={0}
          backgroundColor={theme.overlayBg}
        />
        <box
          position="absolute"
          top={2}
          left="25%"
          width="50%"
          flexDirection="column"
          backgroundColor={theme.modalBg}
        >
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <text fg={theme.primary}>Executing...</text>
          </box>
        </box>
      </box>
    )
  }

  // Normal view - command palette
  return (
    <box
      id="command-palette-overlay"
      width="100%"
      height="100%"
      position="absolute"
      top={0}
      left={0}
    >
      {/* Dim background overlay */}
      <box
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
        backgroundColor={theme.overlayBg}
      />
      
      {/* Command palette centered */}
      <box
        position="absolute"
        top={2}
        left="25%"
        width="50%"
        flexDirection="column"
        backgroundColor={theme.modalBg}
      >
        {/* Header row: Commands + esc */}
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.textDim}>Commands</text>
          <text fg={theme.textMuted}>esc</text>
        </box>

        {/* Search input */}
        <box paddingLeft={2} paddingRight={2} paddingBottom={1} height={2}>
          <input
            value={query}
            placeholder="Search..."
            focused
            backgroundColor={theme.modalBg}
            textColor={theme.text}
            placeholderColor={theme.textMuted}
            width="100%"
          />
        </box>

        {/* Commands list */}
        <box flexDirection="column" paddingBottom={1}>
          {filteredCommands.length === 0 ? (
            <box paddingLeft={2}>
              <text fg={theme.textMuted}>No commands found</text>
            </box>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <box key={category} flexDirection="column">
                {/* Category header */}
                <box paddingLeft={2} paddingTop={1}>
                  <text fg={theme.secondary}>{formatCategory(category)}</text>
                </box>

                {/* Commands in category */}
                {cmds.map((cmd) => {
                  const globalIndex = flatList.findIndex(
                    (item) => item.cmd.id === cmd.id
                  )
                  const isSelected = globalIndex === selectedIndex

                  return (
                    <CommandRow
                      key={cmd.id}
                      command={cmd}
                      selected={isSelected}
                      context={context}
                    />
                  )
                })}
              </box>
            ))
          )}
        </box>

        {/* Footer hints */}
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={theme.textMuted}>
            Ctrl+n/p: navigate  Enter: select
          </text>
        </box>
      </box>
    </box>
  )
}

function CommandRow({
  command,
  selected,
  context,
}: {
  command: Command
  selected: boolean
  context: CommandContext
}) {
  const bg = selected ? theme.selection : undefined
  const fg = selected ? theme.text : theme.textDim
  // Use brighter shortcut color when selected for contrast
  const shortcutFg = selected ? theme.textDim : theme.textMuted
  // Use dynamic label if provided, otherwise use static label
  const label = command.getLabel ? command.getLabel(context) : command.label

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={bg}
      paddingLeft={2}
      paddingRight={2}
      width="100%"
    >
      <text>
        <span fg={fg}>{label}</span>
        {command.dangerous && <span fg={theme.warning}> !</span>}
      </text>
      {command.shortcut && <text fg={shortcutFg}>{command.shortcut}</text>}
    </box>
  )
}

/** Get human-readable reason why PR cannot be merged */
function getMergeBlockedReason(state: string): string {
  switch (state) {
    case "dirty":
      return "Merge conflicts must be resolved"
    case "blocked":
      return "Merge blocked by branch protection rules"
    case "behind":
      return "Branch is behind base branch"
    case "unstable":
      return "Required status checks have not passed"
    case "draft":
      return "PR is still a draft"
    default:
      return "PR cannot be merged"
  }
}
