# Handoff — reaching visual agreement on the redesign (2026-09-03)

Purpose: let a fresh session continue the visual-agreement work without re-deriving anything.
The owner's goal for this stage (stated 2026-09-03): agree, screen by screen, on how the app and
its screens will look. Automation modelling (geometry, re-parsing SRD and content-pack
mechanics) is a later, separate session and must not start here.

## Authority and state

- Design authority: `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` (§1 decisions incl.
  the 2026-09-03 pivot, §3 tokens, §4 information code, §5 component rules 1–33, §6 process).
- Product documents already reconciled in this branch (uncommitted, changeset
  `.changeset/ui-redesign-play-direction.md`): constitution v2.1, golden rule 21, `PRODUCT.md`,
  `CLAUDE.md`, `ARCHITECTURE.md` summary, status report
  `docs/superpowers/status/2026-09-03-ui-redesign-morning-report.md`.
- Research corpus: `docs/superpowers/research/` (patterns, benchmarks, explain-on-demand,
  map-less position, Owlbear, VTT landscape, pattern catalog, component/surface observations).
- Mockups, builders and reference captures (copyrighted, never committed):
  `~/.agents/state/d20-folio/design-2026-09/` — `mockups/` (build8.py … build19.py chained by
  `exec`, `v8.css`, `icons.html`/`icons2.html`, `v8-*.html/png`, `dossier*.html/png`),
  `refs*/` (captures and crops).
- Renderer: `render.mjs <file.html> <w> <h> <out.png> [dpr] [full]` (Playwright Chromium from
  the repo's `node_modules`); crops and boards with `magick`.
- Memory pointer: `ui-redesign-2026-09-state.md` in the Claude memory directory.

## Approval protocol (golden rules 25 and 26)

1. One screen per question, delivered as a chat image the owner can view on a phone.
2. The owner answers "va bene / cosa stona"; corrections are applied to the builder, re-rendered
   and re-sent; an approved screen is recorded in the spec §1 with its date.
3. Dossiers (real reference crops beside our rendition, plus rules) accompany a screen the first
   time; approvals are of screens, not dossiers.
4. Nothing is built in the app before the screen is approved; then the real build goes through
   the repository screenshot gate.

## Screens and status

| #    | Screen                                                                                                                                                  | Mockup                                                  | Status                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| 1–7  | Character cockpit (phone, desktop, spells)                                                                                                              | `v8-mobile`, `v8-desktop`, `v8-spells`                  | rendered, verdict pending             |
| 8    | Explain on demand (AC breakdown)                                                                                                                        | `dossier2`                                              | approved 2026-09-03                   |
| 9–11 | Initiative strip, reaction window, DM board + log                                                                                                       | `v8-encounter-reaction`, `v8-dm`                        | rendered, verdict pending             |
| 12   | Position without map (bands)                                                                                                                            | `dossier4`                                              | fallback when no map; verdict pending |
| 13   | Owlbear bridge                                                                                                                                          | `dossier5`                                              | superseded by the built-in map        |
| 14   | Play screen (player and DM)                                                                                                                             | `v8-play`, `v8-play-dm`, `dossier6`                     | sent 2026-09-03, verdict pending      |
| —    | Roster, campaign hub, compendium, creation                                                                                                              | `v8-roster(-desk)`, `v8-hub`, `v8-comp-*`, `v8-create*` | rendered, verdict pending             |
| —    | Level-up, settings, share view, login/onboarding, phone second-screen (hotbar + dice), 3D dice tray, map tools (fog, scenes, upload), compendium detail | none                                                    | to design                             |

## Next steps

1. Collect verdicts on 14, then 1–7, 9–12, roster/hub/compendium/creation, one at a time.
2. Extend dossier 14 with the VTT capture set (`refs5/`, Owlbear parity checklist) when ready.
3. Design the missing screens in the same builder chain; phone second-screen first.
4. Only after the whole set is approved: commit spec, research, plans and the reconciled product
   documents with the changeset; then plan the app build surface by surface.
