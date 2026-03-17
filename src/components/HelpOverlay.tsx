import { theme } from "../theme"
import type { KeybindingsContext } from "../keybindings"

interface HelpOverlayProps {
  onClose: () => void
  keys: KeybindingsContext
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
        [keys.getKeyDisplay("filter.marked"), "Show marked PRs"],
        [keys.getKeyDisplay("filter.recent"), "Show recent PRs"],
        [keys.getKeyDisplay("filter.starred"), "Show starred authors"],
      ],
    },
    {
      title: "Actions",
      items: [
        [keys.getKeyDisplay("action.checkout"), "Checkout PR locally"],
        [keys.getKeyDisplay("action.copyNumber"), "Copy PR number"],
        [keys.getKeyDisplay("action.copyUrl"), "Copy PR URL"],
        [keys.getKeyDisplay("action.star"), "Star/unstar author"],
        [keys.getKeyDisplay("action.mark"), "Mark/unmark PR"],
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
        [keys.getKeyDisplay("ui.help"), "Toggle help"],
        [keys.getKeyDisplay("ui.commandPalette"), "Command palette"],
        [keys.getKeyDisplay("ui.quit"), "Quit"],
      ],
    },
  ]
}

export function HelpOverlay({ onClose, keys }: HelpOverlayProps) {
  const sections = getHelpSections(keys)
  

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

        {/* Sections */}
        <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1}>
          {sections.map((section) => (
            <box key={section.title} flexDirection="column" marginBottom={1}>
              <text fg={theme.secondary}>{section.title.toUpperCase()}</text>
              {section.items.map(([key, desc]) => (
                <box key={key} height={1} flexDirection="row">
                  <box width={24}>
                    <text fg={theme.warning}>{key}</text>
                  </box>
                  <text fg={theme.textDim}>{desc}</text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
