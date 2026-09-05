#!/usr/bin/env bash
# Record the README demo gif from the demo, unattended — the same tmux capture and
# Pillow render as scripts/shots.sh, one frame per step of docs/demo.txt.
#
#   scripts/demo.sh                     # → site/src/assets/presto-demo.gif
#
# Each line of docs/demo.txt is `hold | keys | keycap | caption` (hold in seconds, or
# `auto` to size it from the caption): the keys are
# sent, the pane is captured after they land, and the frame is shown for that long with
# the keycap and caption drawn on a panel low over it. A line with no keys just holds
# the previous frame longer.
set -euo pipefail

cd "$(dirname "$0")/.."

COLS=${DEMO_COLS:-140}
ROWS=${DEMO_ROWS:-42}
OUT=${DEMO_OUT:-site/src/assets/presto-demo.gif}
SESSION=presto-demo-rec
SCRATCH=${TMPDIR:-/tmp}/presto-demo-rec

rm -rf "$SCRATCH"
mkdir -p "$SCRATCH/xdg"

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

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -x "$COLS" -y "$ROWS" \
  "PRESTO_CONFIG_DIR=$SCRATCH/xdg bun src/index.tsx --demo 2>/dev/null; sleep 600"
sleep 3

# Captions are prose — apostrophes and quotes rule out the `xargs` trim used elsewhere.
trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

# A step made only of cursor keys gets the row ringed and an arrow from where it was
moves() { [ -n "$1" ] && ! printf '%s\n' "$1" | tr -d ' ' | grep -qv '^[0-9jkgG]*$'; }

manifest="$SCRATCH/frames.tsv"
: > "$manifest"
n=0
while IFS='|' read -r hold keys keycap caption; do
  [[ -z "${hold// /}" || "${hold// /}" == \#* ]] && continue
  hold=$(trim "$hold")
  keys=$(trim "$keys")
  keycap=$(trim "${keycap:-}")
  caption=$(trim "${caption:-}")
  for key in $keys; do
    if [ "$key" = "wait" ]; then
      sleep 2
      continue
    fi
    send "$key"
    sleep 0.3
  done
  sleep 0.6
  n=$((n + 1))
  frame=$(printf "%s/frame-%03d.txt" "$SCRATCH" "$n")
  tmux capture-pane -t "$SESSION" -e -N -p > "$frame"
  mark=0; moves "$keys" && mark=1
  printf '%s\t%s\t%s\t%s\t%s\n' "$frame" "$hold" "$keycap" "$caption" "$mark" >> "$manifest"
done < docs/demo.txt

tmux kill-session -t "$SESSION" 2>/dev/null || true
python3 scripts/render-shot.py --gif "$OUT" --frames "$manifest" --cols "$COLS" --rows "$ROWS"
