/**
 * Vim-style command line input at the bottom of the screen
 */

import { theme } from "../theme"

interface CommandLineProps {
  /** Current query value */
  query: string
  /** Called when query changes */
  onChange: (query: string) => void
  /** Called when Enter is pressed */
  onSubmit: () => void
}

export function CommandLine({ query, onChange, onSubmit }: CommandLineProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      <text fg={theme.textMuted}>/</text>
      <input
        value={query}
        onInput={onChange}
        onChange={onSubmit}
        placeholder="filter..."
        focused={true}
        flexGrow={1}
        backgroundColor={theme.headerBg}
        textColor={theme.text}
        placeholderColor={theme.textDim}
      />
    </box>
  )
}
