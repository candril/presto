# Documentation Site

**Status**: Done

## Description

A documentation site at `candril.github.io/presto` — Astro Starlight, deployed from
`site/` by GitHub Pages on every push to `main` — with a logo, a README demo GIF, and
screenshots that are all generated from `presto --demo` (spec 042) by a script, so they
can be regenerated on any Mac and never leak real repositories.

## Out of Scope

- Release binaries or an install script (presto installs via Nix or from source)
- Regenerating screenshots in CI (the renderer needs Menlo; the PNGs are committed)
- Light-theme screenshots

## Capabilities

### P1 - Must Have

- **Screenshots from the demo**: `just shots` launches `presto --demo` in a detached
  tmux pane per recipe in `docs/shots.txt`, sends the keys, captures the pane with
  colours, and renders it to `site/src/assets/screenshots/<name>.png` via Pillow. Same
  input, same picture.
- **README GIF**: `just demo-gif` plays `docs/demo.txt` — `hold | keys | keycap |
  caption` per step — into one demo session and assembles a captioned GIF.
- **Logo**: a hand-written SVG in the app's own palette, plus a PNG for the README and
  the Starlight hero.
- **Site**: splash page, Installation, Getting Started, and reference pages for the
  status columns and merge verdict, key bindings, filtering, actions (palette, merge,
  review, auto-merge, checks, workflows), configuration, and the CLI.
- **Deploy**: `.github/workflows/deploy-site.yml` builds `site/` and publishes to Pages.
- **README**: logo, tagline, `presto --demo`, the GIF, a few sections with screenshots,
  install, and a link to the site for everything else — not a copy of the site.

### P2 - Should Have

- **Screenshot playbook**: `docs/screenshots.md` explains the recipes and how to take
  one by hand.
- **Just recipes**: `just demo`, `just shots [names]`, `just demo-gif`, `just site-dev`,
  `just site-build`.

## Technical Notes

`scripts/render-shot.py`, `scripts/shots.sh` and `scripts/demo.sh` are ports of the
same scripts in lane, with the launch command swapped for
`PRESTO_CONFIG_DIR=… bun src/index.tsx --demo`. Both apps render in Tokyo Night, so the
palette constants carry over unchanged.

The site pins the same Astro/Starlight versions as lane. `base: '/presto'`. The
key-bindings page is written against `src/keybindings/defaults.ts`; the actions page
against `src/commands/definitions.ts`.

## File Structure

- `scripts/render-shot.py`, `scripts/shots.sh`, `scripts/demo.sh`
- `docs/shots.txt`, `docs/demo.txt`, `docs/screenshots.md`
- `site/` — Astro project; `site/src/assets/{logo.svg,logo.png,presto-demo.gif,screenshots/}`
- `.github/workflows/deploy-site.yml`
- `README.md`, `justfile`, `.gitignore`
