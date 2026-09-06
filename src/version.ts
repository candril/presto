// A compiled binary carries PRESTO_VERSION, stamped by scripts/build.ts; under `bun run`
// there is no stamp, and the short commit is the only honest answer.
declare const PRESTO_VERSION: string

function devVersion(): string {
  try {
    const git = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
    if (git.exitCode === 0) {
      return `dev-${git.stdout.toString().trim()}`
    }
  } catch {
    // git may be unavailable
  }
  return "dev"
}

export const version: string = typeof PRESTO_VERSION !== "undefined" ? PRESTO_VERSION : devVersion()
