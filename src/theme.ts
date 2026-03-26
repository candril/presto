// Tokyo Night inspired color palette
export const theme = {
  // Backgrounds
  bg: "#1a1b26",
  headerBg: "#24283b",
  
  // Modal/overlay backgrounds (darker, like Catppuccin mantle)
  modalBg: "#16161e",
  overlayBg: "#00000080",
  selection: "#33467c",

  // Text
  text: "#c0caf5",
  // Recency gradient for PR titles (spec 015)
  textJustNow: "#c0caf5",     // just opened (< 2h) - brightest
  textToday: "#a9b1d6",       // opened today (< 24h)
  textThisWeek: "#787c99",    // opened this week
  textOlder: "#565f89",       // older or never opened - dimmest
  textDim: "#565f89",
  textMuted: "#414868",

  // Accents
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",

  // Borders
  border: "#414868",

  // Semantic PR colors
  prOpen: "#9ece6a",
  prMerged: "#bb9af7",
  prClosed: "#f7768e",
  prDraft: "#565f89",
}

/**
 * Fixed color palette for mark letters (spec 028).
 * Each letter always maps to the same color. Catppuccin Mocha palette.
 * Letters beyond the palette cycle back through it.
 */
const MARK_PALETTE = [
  "#f38ba8",  // red
  "#fab387",  // peach
  "#f9e2af",  // yellow
  "#a6e3a1",  // green
  "#94e2d5",  // teal
  "#89dceb",  // sky
  "#89b4fa",  // blue
  "#cba6f7",  // mauve
]

/** Get the color for a mark letter (a-z). Deterministic — same letter always same color. */
export function getMarkColor(letter: string): string {
  const index = letter.charCodeAt(0) - "a".charCodeAt(0)
  return MARK_PALETTE[index % MARK_PALETTE.length]
}
