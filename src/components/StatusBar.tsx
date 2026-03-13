import { theme } from "../theme"

interface StatusBarProps {
  /** Current filter query to display */
  filterQuery?: string
}

export function StatusBar({ filterQuery }: StatusBarProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Filter query on left */}
      {filterQuery && (
        <text>
          <span fg={theme.primary}>/</span>
          <span fg={theme.text}>{filterQuery}</span>
        </text>
      )}
      
      {/* Spacer */}
      <box flexGrow={1} />
      
      {/* Help hint on right */}
      <text>
        <span fg={theme.textDim}>?: help</span>
      </text>
    </box>
  )
}
