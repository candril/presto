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
  type Command,
  type CommandContext,
  type CommandResult,
} from "../commands"

interface CommandPaletteProps {
  visible: boolean
  context: CommandContext
  onClose: () => void
  onResult: (result: CommandResult) => void
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

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
      setConfirming(null)
      setExecuting(false)
    }
  }, [visible])

  // Get available commands and filter by query
  const availableCommands = useMemo(
    () => getAvailableCommands(context),
    [context.selectedPR]
  )

  const filteredCommands = useMemo(() => {
    if (!query) return availableCommands

    const q = query.toLowerCase()
    return availableCommands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.shortcut?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    )
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
      onClose()
      onResult(result)
    } catch (err) {
      onClose()
      onResult({ type: "error", message: String(err) })
    }
  }

  useKeyboard((key) => {
    if (!visible) return

    // Confirmation mode
    if (confirming) {
      if (key.name === "return") {
        handleExecute(confirming)
      } else if (key.name === "escape") {
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
            <text fg={theme.textMuted}>esc</text>
          </box>
          {/* Message */}
          <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
            <text>
              <span fg={theme.text}>{confirming.label}</span>
              <span fg={theme.textDim}>
                {" "}
                #{pr?.number} "{truncate(pr?.title || "", 30)}"
              </span>
            </text>
          </box>
          {/* Footer */}
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
            <text fg={theme.textMuted}>
              Press Enter to confirm, Escape to cancel
            </text>
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
}: {
  command: Command
  selected: boolean
}) {
  const bg = selected ? theme.selection : undefined
  const fg = selected ? theme.text : theme.textDim

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
        <span fg={fg}>{command.label}</span>
        {command.dangerous && <span fg={theme.warning}> !</span>}
      </text>
      {command.shortcut && <text fg={theme.textMuted}>{command.shortcut}</text>}
    </box>
  )
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "..." : str
}
