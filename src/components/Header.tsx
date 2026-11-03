import { useEffect, useState } from "react"
import { theme } from "../theme"
import { Spinner } from "./Loading"
import { formatRelativeTime } from "../utils/time"

/** Often enough that the age never lags by more than a unit of what it prints */
const AGE_TICK_MS = 30_000

interface HeaderProps {
  title: string
  /** Dim tag after the title — "demo", so a screenshot can never pass for real data */
  badge?: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Repos answered so far while a refresh is out */
  progress?: { done: number; total: number } | null
  /** Right side content (e.g., count) */
  right?: string
  /** How old the rows on screen are: the last refresh, or the cache they were loaded from */
  asOf?: Date | null
  /** Past this age the time is shown as a warning; 0 never warns */
  staleAfterMs?: number
  /** Repos whose rows are kept from an earlier fetch because the last one failed */
  staleRepos?: string[]
}

export function Header({ title, badge, loading, progress, right, asOf, staleAfterMs = 0, staleRepos = [] }: HeaderProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), AGE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const isOld = asOf != null && staleAfterMs > 0 && Date.now() - asOf.getTime() > staleAfterMs
  const warn = isOld || staleRepos.length > 0
  const staleText =
    staleRepos.length > 0 ? ` · ${staleRepos.length} repo${staleRepos.length === 1 ? "" : "s"} stale` : ""

  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: Title */}
      <text>
        <span fg={theme.primary}>{title}</span>
        {badge && <span fg={theme.textMuted}>{`  ${badge}`}</span>}
      </text>

      {/* Spacer pushes right content to far right */}
      <box flexGrow={1} />

      {!loading && asOf && (
        <box marginRight={2}>
          <text>
            <span fg={warn ? theme.warning : theme.textMuted}>
              {warn ? "! " : ""}
              {formatRelativeTime(asOf)}
              {staleText}
            </span>
          </text>
        </box>
      )}

      {/* Right side: loading indicator and count - always at far right */}
      {loading && (
        <box marginRight={1} flexDirection="row">
          <Spinner />
          {progress && progress.total > 1 && (
            <text>
              <span fg={theme.textMuted}>{` ${progress.done}/${progress.total}`}</span>
            </text>
          )}
        </box>
      )}
      {right && (
        <text>
          <span fg={theme.textDim}>{right}</span>
        </text>
      )}
    </box>
  )
}
