import { theme } from "../theme"

interface HelpOverlayProps {
  onClose: () => void
}

const HELP_SECTIONS = [
  {
    title: "Navigation",
    keys: [
      ["j / k", "Move down / up"],
      ["g / G", "Go to top / bottom"],
      ["Enter", "Open in riff"],
      ["o", "Open in browser"],
    ],
  },
  {
    title: "Preview",
    keys: [
      ["p", "Toggle preview"],
      ["P", "Switch preview position"],
      ["Ctrl-d / Ctrl-u", "Scroll preview"],
    ],
  },
  {
    title: "Filter",
    keys: [
      ["/", "Open filter"],
      ["Esc", "Clear filter"],
      ["Tab", "Autocomplete"],
    ],
  },
  {
    title: "Actions",
    keys: [
      ["y", "Copy PR number"],
      ["Y", "Copy PR URL"],
      ["s", "Star/unstar author"],
      ["r / R", "Refresh"],
    ],
  },
  {
    title: "Other",
    keys: [
      ["?", "Toggle help"],
      ["q", "Quit"],
    ],
  },
]

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      justifyContent="center"
      alignItems="center"
    >
      {/* Semi-transparent backdrop */}
      <box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        backgroundColor="#000000"
      />
      
      {/* Help content */}
      <box
        flexDirection="column"
        border={true}
        borderStyle="rounded"
        borderColor={theme.primary}
        backgroundColor={theme.bg}
        padding={1}
        minWidth={50}
      >
        <box height={1} marginBottom={1}>
          <text>
            <span fg={theme.primary}>Keyboard Shortcuts</span>
          </text>
        </box>

        {HELP_SECTIONS.map((section) => (
          <box key={section.title} flexDirection="column" marginBottom={1}>
            <text fg={theme.textMuted}>{section.title}</text>
            {section.keys.map(([key, desc]) => (
              <box key={key} height={1} flexDirection="row">
                <box width={20}>
                  <text fg={theme.warning}>{key}</text>
                </box>
                <text fg={theme.text}>{desc}</text>
              </box>
            ))}
          </box>
        ))}

        <box height={1} marginTop={1}>
          <text fg={theme.textDim}>Press ? or Esc to close</text>
        </box>
      </box>
    </box>
  )
}
