# Screenshots and the demo gif

Every image in the README and on the docs site comes from the built-in demo
(`presto --demo`, spec 042), so it can be regenerated on any machine without a GitHub
account, the same picture comes out twice, and no real repository ever appears in one.

## The automated way

```sh
just shots              # every recipe in docs/shots.txt → site/src/assets/screenshots/
just shots list help    # only those two
```

Needs `tmux` and `python3` with Pillow (`pip install pillow`). Each shot launches a
fresh `presto --demo` in a detached 140×42 tmux pane with a throwaway
`PRESTO_CONFIG_DIR`, sends the recipe's keys, captures the pane with its colours, and
renders it in Menlo on the app's background. The rendered PNGs are what the docs use;
the raw captures land in `$TMPDIR/presto-shots/` if you want to inspect one.

`SHOT_COLS` / `SHOT_ROWS` change the pane size, `SHOT_DIR` the output directory.

## The recipes

`docs/shots.txt` is the playbook: one line per image, `name | keys`. The keys are what
you would press by hand after launching, as tmux `send-keys` tokens — a letter, a
string (each character is typed), `Enter`, `Escape`, `Space`, `C-p`, plus `wait` for a
background load and `5j` for five presses of `j`. The demo opens on the list with the gate columns collapsed and the
cursor on the most recently updated PR; `c` expands the columns. Rows are sorted by
activity, so `G` and a few `k`s is the stable way to reach the older PRs.

| Image | Keys | Shows |
| --- | --- | --- |
| `list` | `c` | the list with all five status columns |
| `list-compact` | — | the list as it opens: state and merge verdict only |
| `preview` | `c 3j p` | the preview panel on the right |
| `preview-bottom` | `c 3j p P` | …at the bottom |
| `preview-author` | `c G 6k p` | a PR with open review threads |
| `help` | `?` | the shortcut dialog with the column legend |
| `palette` | `c 3j ^P` | the command palette |
| `filter` | `c / @mara repo:` | the filter prompt with suggestions |
| `filter-applied` | `c / @mara repo:api ↵` | a narrowed list |
| `tabs` | `c t / @mara ↵` | a second tab named after its filter |
| `marks` | `c m a j m b 2j m a` | PRs marked with letters |
| `unread` | `c v 2j v` | unread dots |
| `review` / `merge` / `automerge` | `^P` then `review` / `merge` / `auto` | the dialogs |
| `workflow` / `workflow-inputs` | `^P trigger ↵` (then `^N ↵`) | the trigger-workflow dialog |
| `pending` | `^P update ↵` on a PR behind its base | the ↻ marker |
| `toast` | `c 2j m a r`, then approve via `^P` | the change notification on a marked PR (the refresh after marking takes the snapshot) |

## By hand

If you'd rather screenshot a real terminal (nicer font, your own theme), `just demo`
opens the same demo at whatever size the window is. Set it to 140×42 cells so the
framing matches, follow a recipe from the table, and save the image under the same name
in `site/src/assets/screenshots/`.

## The demo gif

```sh
just demo-gif         # → site/src/assets/presto-demo.gif
```

Same machinery: `docs/demo.txt` is a list of `hold-seconds | keys | keycap | caption`
steps, `scripts/demo.sh` plays them into one `presto --demo` session, captures a frame
after each, and the renderer assembles the frames into a GIF at half size. The keycap
and caption are drawn on a translucent panel low over the frame — without them the tour
is a list flickering through states nobody can name — so every step says which keys
were pressed and what they did. Give every step a caption: a step without one drops the
panel, and it reads as a glitch. Edit the steps to change the tour; it comes out
identical every time.
