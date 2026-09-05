/**
 * Actions that never leave the machine. Everything that touches GitHub or hands a PR to
 * another tool goes through `src/providers` instead, so the demo can answer it.
 */

export { copyPRUrl, copyPRNumber, copyPRBranch } from "./tools"
