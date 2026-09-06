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

# Build and install the binary to ~/.local/bin
#
# `install` replaces the inode deliberately: copying over the existing file keeps it, and
# macOS kills a running binary whose cached code signature no longer matches — silently,
# exit 137.
install-bin: build
    mkdir -p ~/.local/bin
    install -m 755 dist/presto ~/.local/bin/presto
    @~/.local/bin/presto --version >/dev/null || (echo "installed binary does not run" && exit 1)
    @echo "installed: ~/.local/bin/presto $(~/.local/bin/presto --version)"

# Tag a release: just release 0.2.0 (pushing the tag is what builds and publishes it)
#
# The tag is the version a released binary reports, so package.json and CHANGELOG.md are
# checked against it here rather than after four runners have built the wrong number.
# jj cannot create git tags, hence plain `git tag` against the colocated repo.
release version:
    @grep -q '"version": "{{version}}"' package.json || (echo "package.json is not {{version}}" && exit 1)
    @grep -q '^## \[{{version}}\]' CHANGELOG.md || (echo "CHANGELOG.md has no [{{version}}] section" && exit 1)
    @test -z "$(jj diff --name-only)" || (echo "working copy has uncommitted changes" && exit 1)
    just typecheck
    just test
    git tag v{{version}}
    @echo "tagged v{{version}} at $(git rev-parse --short HEAD)"
    @echo "publish it with: git push origin v{{version}}"
