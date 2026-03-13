import { theme } from "../theme"

interface HeaderProps {
  title: string
  /** Filter query value */
  filterQuery: string
  /** Whether the filter input is focused */
  filterFocused: boolean
  /** Called when filter value changes */
  onFilterChange: (query: string) => void
  /** Called when Enter is pressed (accept filter) */
  onFilterSubmit: () => void
  right?: string
}

export function Header({ title, filterQuery, filterFocused, onFilterChange, onFilterSubmit, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      <text>
        <span fg={theme.primary}>{title}</span>
      </text>
      <box flexGrow={1} paddingX={1} flexDirection="row">
        <text fg={theme.textMuted}>/</text>
        <input
          value={filterQuery}
          onInput={onFilterChange}
          onChange={onFilterSubmit}
          placeholder={filterFocused ? "filter..." : ""}
          focused={filterFocused}
          flexGrow={1}
          backgroundColor={theme.headerBg}
          textColor={theme.text}
          placeholderColor={theme.textDim}
        />
      </box>
      {right && (
        <box>
          <text>
            <span fg={theme.textDim}>{right}</span>
          </text>
        </box>
      )}
    </box>
  )
}
