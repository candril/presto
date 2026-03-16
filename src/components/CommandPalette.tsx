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

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
      setConfirming(null)
      setExecuting(false)
      setMergeDialog(null)
      setLoadingMergeOptions(false)
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
      
      onClose()
      onResult(result)
    } catch (err) {
      onClose()
      onResult({ type: "error", message: String(err) })
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
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          {query ? (
            <text fg={theme.text}>{query}</text>
          ) : (
            <text fg={theme.textMuted}>Search...</text>
          )}
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

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "..." : str
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
