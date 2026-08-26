import { useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { theme } from "../theme"
import type { KeybindingsContext } from "../keybindings"

interface HelpOverlayProps {
  onClose: () => void
  keys: KeybindingsContext
}

/**
 * Decoder for the status columns. Ordered by the question the user asks first — the
 * merge verdict is the summary, everything above it in the row explains it.
 */
function getLegend(keys: KeybindingsContext) {
  return {
    hint: `${keys.getKeyDisplay("ui.gateDetail")} expands S C R B M`,
    items: [
      { icon: "✓", col: "M", color: theme.success, text: "ready — merge it now" },
      { icon: "!", col: "M", color: theme.warning, text: "author's move — comments, conflicts, behind, CI" },
      { icon: "?", col: "M", color: theme.primary, text: "waiting on others — usually a review" },
      { icon: "·", col: "M", color: theme.textMuted, text: "machine's move — CI or GitHub working" },
      { icon: "⇢", col: "M", color: theme.secondary, text: "auto-merge armed — lands by itself" },
      { icon: "↻", col: "M", color: theme.warning, text: "your branch update still landing" },
      { icon: "-", col: "M", color: theme.textMuted, text: "draft — not up for merge yet" },
      { icon: "↓", col: "B", color: theme.warning, text: "behind base — dim when optional" },
      { icon: "✓", col: "B", color: theme.success, text: "up to date · - cannot tell (fork)" },
      { icon: "✓", col: "C", color: theme.success, text: "checks pass · ✗ fail · * running/queued" },
      { icon: "✓", col: "R", color: theme.success, text: "approved · ! changes · ? review required" },
      { icon: "○", col: "S", color: theme.prOpen, text: "open · ◌ draft · ● merged · ✗ closed" },
    ],
  }
}

/** Generate help sections with configured keybindings */
function getHelpSections(keys: KeybindingsContext) {
  return [
    {
      title: "Navigation",
      items: [
        [keys.getKeyDisplay("nav.down") + " / " + keys.getKeyDisplay("nav.up"), "Move down / up"],
        [keys.getKeyDisplay("nav.top") + " / " + keys.getKeyDisplay("nav.bottom"), "Go to top / bottom"],
        [keys.getKeyDisplay("action.open"), "Open in riff"],
        [keys.getKeyDisplay("action.openTmux"), "Open in riff (tmux window)"],
        [keys.getKeyDisplay("action.browser"), "Open in browser"],
      ],
    },
    {
      title: "Preview",
      items: [
        [keys.getKeyDisplay("ui.preview"), "Toggle preview"],
        [keys.getKeyDisplay("ui.previewCycle"), "Switch preview position"],
        [keys.getKeyDisplay("nav.pageDown") + " / " + keys.getKeyDisplay("nav.pageUp"), "Scroll preview"],
      ],
    },
    {
      title: "Filter",
      items: [
        [keys.getKeyDisplay("filter.open"), "Open filter"],
        [keys.getKeyDisplay("filter.clear"), "Clear filter"],
        ["Tab", "Autocomplete"],
        [keys.getKeyDisplay("filter.unread"), "Show unread PRs"],
        [keys.getKeyDisplay("filter.marked"), "Show marked PRs"],
        [keys.getKeyDisplay("filter.recent"), "Show recent PRs"],
        [keys.getKeyDisplay("filter.starred"), "Show starred authors"],
      ],
    },
    {
      title: "Actions",
      items: [
        [keys.getKeyDisplay("action.diff"), "View diff"],
        [keys.getKeyDisplay("action.checks"), "Open failing checks in browser"],
        [keys.getKeyDisplay("action.checkout"), "Checkout PR locally"],
        [keys.getKeyDisplay("action.copyNumber"), "Copy PR number"],
        [keys.getKeyDisplay("action.copyUrl"), "Copy PR URL"],
        [keys.getKeyDisplay("action.copyBranch"), "Copy branch name"],
        [keys.getKeyDisplay("action.star"), "Star/unstar author"],
        [keys.getKeyDisplay("action.toggleSeen"), "Toggle seen/unseen"],
        [keys.getKeyDisplay("action.mark") + " + a-z", "Mark PR with letter"],
        ["' + a-z", "Filter to mark letter"],
        [keys.getKeyDisplay("action.refresh"), "Refresh"],
      ],
    },
    {
      title: "Tabs",
      items: [
        [keys.getKeyDisplay("tab.new"), "New tab"],
        [keys.getKeyDisplay("tab.close"), "Close tab"],
        [keys.getKeyDisplay("tab.undo"), "Undo close"],
        [keys.getKeyDisplay("tab.prev") + " / " + keys.getKeyDisplay("tab.next"), "Previous / next tab"],
        ["1-9", "Switch to tab N"],
      ],
    },
    {
      title: "Other",
      items: [
        [keys.getKeyDisplay("ui.gateDetail"), "Expand/collapse status columns"],
        [keys.getKeyDisplay("ui.help"), "Toggle help"],
        [keys.getKeyDisplay("ui.commandPalette"), "Command palette"],
        [keys.getKeyDisplay("ui.console"), "Toggle console"],
        [keys.getKeyDisplay("ui.quit"), "Quit"],
      ],
    },
  ]
}

/** One rendered line of the overlay body */
type HelpRow =
  | { kind: "blank" }
  | { kind: "title"; text: string; hint?: string }
  | { kind: "legend"; icon: string; color: string; col: string; text: string }
  | { kind: "pair"; key: string; desc: string }

function buildRows(keys: KeybindingsContext): HelpRow[] {
  const legend = getLegend(keys)
  const rows: HelpRow[] = [{ kind: "title", text: "STATUS COLUMNS", hint: legend.hint }]
  for (const item of legend.items) {
    rows.push({ kind: "legend", icon: item.icon, color: item.color, col: item.col, text: item.text })
  }
  for (const section of getHelpSections(keys)) {
    rows.push({ kind: "blank" }, { kind: "title", text: section.title.toUpperCase() })
    for (const [key, desc] of section.items) {
      rows.push({ kind: "pair", key, desc })
    }
  }
  return rows
}

export function HelpOverlay({ onClose, keys }: HelpOverlayProps) {
  const rows = buildRows(keys)
  const { height: terminalHeight } = useTerminalDimensions()
  const [offset, setOffset] = useState(0)

  // Terminal minus: top inset (2), header block (3), footer (1), bottom padding (1)
  const bodyHeight = Math.max(5, terminalHeight - 7)
  const maxOffset = Math.max(0, rows.length - bodyHeight)
  // Clamp on every render: the terminal can be resized while the overlay is open
  const scrollTop = Math.min(offset, maxOffset)
  const visible = rows.slice(scrollTop, scrollTop + bodyHeight)

  useKeyboard((key) => {
    const move = (delta: number) => setOffset((o) => Math.max(0, Math.min(maxOffset, o + delta)))
    if (key.name === "j" || key.name === "down") move(1)
    else if (key.name === "k" || key.name === "up") move(-1)
    else if (key.ctrl && key.name === "d") move(Math.floor(bodyHeight / 2))
    else if (key.ctrl && key.name === "u") move(-Math.floor(bodyHeight / 2))
    // Shift+G arrives as name "g" with shift set, so the shifted case must be tested first
    else if (key.name === "g" && key.shift) setOffset(maxOffset)
    else if (key.name === "g") setOffset(0)
  })

  return (
    <box
      id="help-overlay"
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

      {/* Help content centered */}
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
          <text fg={theme.primary}>Keyboard Shortcuts</text>
          <text fg={theme.textMuted}>esc</text>
        </box>

        {/* Body: a fixed window onto `rows`, scrolled with j/k */}
        <box flexDirection="column" paddingLeft={2} paddingRight={2}>
          {visible.map((row, index) => (
            <box key={`${scrollTop + index}`} height={1} flexDirection="row">
              {row.kind === "blank" && <text> </text>}
              {row.kind === "title" && (
                <text>
                  <span fg={theme.secondary}>{row.text}</span>
                  {row.hint ? <span fg={theme.textMuted}>{"  " + row.hint}</span> : ""}
                </text>
              )}
              {row.kind === "legend" && (
                <>
                  <box width={4}>
                    <text fg={row.color}>{row.icon}</text>
                  </box>
                  <box width={4}>
                    <text fg={theme.textDim}>{row.col}</text>
                  </box>
                  <text fg={theme.textDim}>{row.text}</text>
                </>
              )}
              {row.kind === "pair" && (
                <>
                  <box width={24}>
                    <text fg={theme.warning}>{row.key}</text>
                  </box>
                  <text fg={theme.textDim}>{row.desc}</text>
                </>
              )}
            </box>
          ))}
        </box>

        {/* Footer: only claims scrollability when there is more to see */}
        <box paddingLeft={2} paddingRight={2} paddingBottom={1} height={2} flexDirection="row">
          <text fg={theme.textMuted}>
            {maxOffset > 0
              ? `j/k scroll · ${scrollTop + 1}-${scrollTop + visible.length} of ${rows.length}`
              : "esc to close"}
          </text>
        </box>
      </box>
    </box>
  )
}
