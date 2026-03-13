#!/usr/bin/env bun

/**
 * Build script for presto
 * 
 * Creates a compiled binary with proper tree-sitter worker embedding.
 * Based on riff's build approach.
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectDir = path.resolve(__dirname, "..")

process.chdir(projectDir)

// Parse command line arguments
const args = process.argv.slice(2)
const singleFlag = args.includes("--single") || args.length === 0

// Target configurations
interface BuildTarget {
  os: "darwin" | "linux" | "win32"
  arch: "arm64" | "x64"
}

const allTargets: BuildTarget[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "arm64" },
]

// If --single flag or no args, build only for current platform
const targets = singleFlag
  ? allTargets.filter(t => t.os === process.platform && t.arch === process.arch)
  : allTargets

if (targets.length === 0) {
  console.error(`No matching target for platform: ${process.platform}/${process.arch}`)
  console.log("Available targets:", allTargets.map(t => `${t.os}-${t.arch}`).join(", "))
  process.exit(1)
}

// Clean dist directory
await $`rm -rf dist`
await $`mkdir -p dist`

// Get the parser worker path
const parserWorkerPath = fs.realpathSync(
  path.resolve(projectDir, "./node_modules/@opentui/core/parser.worker.js")
)
const workerRelativePath = path.relative(projectDir, parserWorkerPath).replaceAll("\\", "/")

console.log(`Parser worker: ${workerRelativePath}`)

for (const target of targets) {
  const targetName = `bun-${target.os}-${target.arch}` as const
  const outfile = `dist/presto-${target.os}-${target.arch}`
  
  console.log(`\nBuilding ${targetName}...`)
  
  // Use platform-specific bunfs root path
  const bunfsRoot = target.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerPathInBinary = bunfsRoot + workerRelativePath
  
  console.log(`  Worker path in binary: ${workerPathInBinary}`)
  
  const result = await Bun.build({
    entrypoints: [
      "./src/index.tsx",
      parserWorkerPath,  // Include worker as entrypoint so it gets bundled
    ],
    target: "bun",
    sourcemap: "external",
    compile: {
      target: targetName as any,  // Type assertion needed for valid targets
      outfile,
    },
    define: {
      // Define the worker path as a compile-time constant
      // The value must be a valid JS expression, so we JSON.stringify the string
      "OTUI_TREE_SITTER_WORKER_PATH": JSON.stringify(workerPathInBinary),
    },
  })
  
  if (!result.success) {
    console.error(`Build failed for ${targetName}:`)
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }
  
  console.log(`  Built: ${outfile}`)
}

// If single target, also create a simple "presto" symlink/copy
if (singleFlag && targets.length === 1) {
  const target = targets[0]!
  const source = `dist/presto-${target.os}-${target.arch}`
  const dest = "dist/presto"
  await $`cp ${source} ${dest}`
  console.log(`\nCopied to: ${dest}`)
}

console.log("\nBuild complete!")
console.log("Binaries in ./dist/")
