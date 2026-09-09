# Diagrams

Every diagram in a map document has its archify source here (golden rule 39): the `.json` is the
fact, the `.svg` a build product. Never hand-edit an `.svg`, never embed one with no source.

| Source (`.json` + `.svg`) | Type         | What it shows                                                             |
| ------------------------- | ------------ | ------------------------------------------------------------------------- |
| `system-architecture`     | architecture | Client layers, engine, pack seam, Firebase surfaces, both projects        |
| `encounter-dataflow`      | dataflow     | Intent → preflight → log → fold → surfaces, dice seam and undo            |
| `intent-sequence`         | sequence     | One attack with a reaction window across player, `encounters/live`, DM    |
| `encounter-lifecycle`     | lifecycle    | `Clock.phase` idle/gathering/turns/ended, windows, correction, compaction |
| `character-persistence`   | dataflow     | Creation/import → the five-document transaction → the read seams          |

## Regenerate

With `A=~/.agents/skills/archify` and `<type>` from the table:

```bash
node "$A/bin/archify.mjs" validate <type> docs/diagrams/<name>.json --quality showcase --json
node "$A/bin/archify.mjs" deliver <type> docs/diagrams/<name>.json docs/diagrams/<name>.html \
  --quality showcase --json
```

Validation must report all 9 artifact checks with 0 errors and 0 warnings. `system-architecture`
takes `--repo-root "$PWD"` as well, which verifies every `components[].sources` path against the
revision pinned in `meta.repository`; update that revision when a cited file moves.

The SVG comes from the delivered viewer's **Export → SVG** (a self-contained `<svg>` carrying its
own `<style>`), saved as `docs/diagrams/<name>.svg`; drive that button headlessly with Playwright.
The `.html` viewers are gitignored.

After editing a source run `pnpm exec prettier --write docs/diagrams/*.json`, then validate again.
