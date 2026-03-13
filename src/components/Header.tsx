import { theme } from "../theme"
import { Spinner } from "./Loading"

interface HeaderProps {
  title: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., count) */
  right?: string
  /** Preview mode active */
  previewMode?: boolean
  /** Preview is loading */
  previewLoading?: boolean
}

export function Header({ title, loading, right, previewMode, previewLoading }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: Title */}
      <box width={previewMode ? "50%" : undefined} flexDirection="row">
        <text>
          <span fg={theme.primary}>{title}</span>
        </text>
        {!previewMode && <box flexGrow={1} />}
        {!previewMode && loading && (
          <box marginRight={1}>
            <Spinner />
          </box>
        )}
        {!previewMode && right && (
          <text>
            <span fg={theme.textDim}>{right}</span>
          </text>
        )}
      </box>

      {/* Spacer when not in preview mode */}
      {!previewMode && <box flexGrow={1} />}

      {/* Right side: Preview header (when preview mode is on) */}
      {previewMode && (
        <>
          {/* Left side extras */}
          <box flexGrow={1} />
          {loading && (
            <box marginRight={1}>
              <Spinner />
            </box>
          )}
          {right && (
            <text>
              <span fg={theme.textDim}>{right}</span>
            </text>
          )}

          {/* Preview header - takes remaining 50% */}
          <box
            width="50%"
            flexDirection="row"
            paddingLeft={1}
            border={["left"]}
            borderStyle="single"
            borderColor={theme.border}
          >
            <text>
              <span fg={theme.primary}>Preview</span>
            </text>
            {previewLoading && (
              <box marginLeft={1}>
                <Spinner />
              </box>
            )}
          </box>
        </>
      )}
    </box>
  )
}
