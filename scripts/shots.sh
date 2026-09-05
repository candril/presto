#!/usr/bin/env bash
# Take the documentation screenshots from the demo, unattended.
#
#   scripts/shots.sh [name ...]         # all shots in docs/shots.txt, or just the named ones
#
# Each line of docs/shots.txt is `name | keys`, where keys are tmux send-keys tokens
# (Enter, Escape, Space, C-p, or a literal string) sent one at a time; `wait` pauses
# for a background load. Every shot starts from a fresh launch of `presto --demo` in a
# detached tmux pane with a throwaway config dir, so the sequence in the file is the
# whole recipe — the same keys you would press by hand. The pane is captured with its
# colours and rendered to a PNG.
set -euo pipefail

cd "$(dirname "$0")/.."

COLS=${SHOT_COLS:-140}
ROWS=${SHOT_ROWS:-42}
OUT=${SHOT_DIR:-site/src/assets/screenshots}
SESSION=presto-shots
SCRATCH=${TMPDIR:-/tmp}/presto-shots

mkdir -p "$OUT" "$SCRATCH"

# A token like `5j` presses j five times. Repeated letters cannot be sent as one string:
# the app parses an input chunk as a single key, so "jjjjj" would move once.
send() {
  if [[ "$1" =~ ^([0-9]+)([a-zA-Z])$ ]]; then
    local i
    for ((i = 0; i < ${BASH_REMATCH[1]}; i++)); do
      tmux send-keys -t "$SESSION" -- "${BASH_REMATCH[2]}"
      sleep 0.15
    done
  else
    tmux send-keys -t "$SESSION" -- "$1"
  fi
}

launch() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -rf "$SCRATCH/xdg"
  tmux new-session -d -s "$SESSION" -x "$COLS" -y "$ROWS" \
    "PRESTO_CONFIG_DIR=$SCRATCH/xdg bun src/index.tsx --demo 2>/dev/null; sleep 300"
  sleep 3
}

shoot() {
  local name=$1; shift
  launch
  for key in "$@"; do
    if [ "$key" = "wait" ]; then
      sleep 2
      continue
    fi
    send "$key"
    sleep 0.35
  done
  sleep 1
  tmux capture-pane -t "$SESSION" -e -N -p > "$SCRATCH/$name.txt"
  python3 scripts/render-shot.py "$SCRATCH/$name.txt" "$OUT/$name.png" --cols "$COLS" --rows "$ROWS"
}

wanted=("$@")
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  name=$(echo "${line%%|*}" | xargs)
  keys=$(echo "${line#*|}" | xargs)
  if [ ${#wanted[@]} -gt 0 ] && [[ ! " ${wanted[*]} " == *" $name "* ]]; then
    continue
  fi
  # shellcheck disable=SC2086
  shoot "$name" $keys
done < docs/shots.txt

tmux kill-session -t "$SESSION" 2>/dev/null || true
echo "done → $OUT"
