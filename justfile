# Default recipe - show available commands
default:
    @just --list

# Run the TUI application
run *args:
    bun src/index.tsx {{args}}

# Run with hot reload (watches for changes)
dev *args:
    bun --watch src/index.tsx {{args}}

# Install dependencies
install:
    bun install

# Add a new dependency
add package:
    bun add {{package}}

# Add a dev dependency
add-dev package:
    bun add -d {{package}}

# Remove a dependency
remove package:
    bun remove {{package}}

# Update all dependencies
update:
    bun update

# Run tests
test:
    bun test

# Run tests in watch mode
test-watch:
    bun test --watch

# Type check without emitting
typecheck:
    bun x tsc --noEmit

# Build standalone binary
build:
    bun scripts/build.ts

# Build for all platforms
build-all:
    bun scripts/build.ts --all

# Clean node_modules and reinstall
clean:
    rm -rf node_modules bun.lock && bun install

# Show outdated dependencies
outdated:
    bun outdated

# Run the offline demo: no gh, no network, nothing written to ~/.config/presto
demo:
    bun src/index.tsx --demo

# Take every docs screenshot from the demo, unattended (tmux + python3/Pillow)
shots *names:
    bash scripts/shots.sh {{names}}

# Record the README demo gif from the demo, unattended (tmux + python3/Pillow)
demo-gif:
    bash scripts/demo.sh

# Run the documentation site locally
site-dev:
    cd site && bun run dev

# Build the documentation site
site-build:
    cd site && bun run build
