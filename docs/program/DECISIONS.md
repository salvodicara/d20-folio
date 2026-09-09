# Owner decisions

Dated owner decisions for d20 Folio v2, newest first; the newest dated statement wins and an older
one is kept only as history. This file records what was decided and when, never execution state,
which belongs to [`docs/PROGRAM_STATUS.md`](../PROGRAM_STATUS.md). Italian is quoted where the
source quotes the owner: his words are the evidence of intent.

## 2026-09-09 — knowledge-base reset

<!-- source: .superpowers/sdd/2026-09-09-v2-knowledge-base-reset/decisions-2026-09-09.md -->

Framing: "Ho l'impressione che abbiamo ammazzato il progetto e lo abbiamo rallentato con troppe robe
discordanti. Dobbiamo ripulire tutto per la v2." · "codex/gpt lavorano attivamente sul progetto e
devono essere in grado avere la stessa knowledge base/skills di claude. Questo è imprescindibile."

1. **One program, in the repository.** The P01–P30 program is the only plan; the earlier stages 0–6
   are closed history, one line with a SHA. Program, checklist, decisions and the approved mock's
   manifest live under `docs/program/`. The visual reference is mock 0.9.3 plus the shell
   corrections of 7 September plus the 9 September engagement feedback, recorded as an open block.
   `docs/PROGRAM_STATUS.md` returns to one page.
2. **Archive the v1 documents and rewrite the map short.** PROGRESS, DESIGN, ARCHITECTURE,
   MECHANICS, AUTOMATION_COVERAGE and BACKLOG, CHARACTER_SCHEMA, BUG_REPORTING and POSITIONING move
   to `docs/archive/v1/`; each map document is rewritten from the v2 code, with a size cap and one
   owner per fact. "È inoltre fondamentale che vengano usati schemi archify e graphify" — the
   diagrams and the graph are mandatory parts of the map.
3. **Skills: only what the repository routes.** Kept: superpowers, impeccable, ponytail and
   ponytail-review, grill-me, graphify, archify, task-observer, find-skills, playwright-cli and
   claude-mem; the `*-extras` are mined into CONTRIBUTING and GOLDEN_RULES, then deleted, and
   `~/.agents/skills` is canonical with the harness directories as symlinks. No icon skill for now
   ("possiamo sempre installare la skill migliore dopo"): 9 September asks for raster art.
4. **The repository is the only memory.** Decisions go to PRODUCT §Steering and this file, state to
   `docs/PROGRAM_STATUS.md`; Claude's auto-memory shrinks to harness hazards plus a pointer, and
   claude-mem stays on both harnesses as search only, never authority.
5. **The graph is committed on `v2` and refreshed by a pre-commit hook** (`graphify-out/graph.json`
   and `GRAPH_REPORT.md`, HTML excluded): "ci deve assolutamente essere un grafo graphify sempre
   aggiornato, quello ci fa risparmiare tempo e token". `CLAUDE.md` says: query the graph before
   reading files.
6. **Worktrees: everything except `main` and `v2` is removed**, dirty changes saved as patches
   under `~/Workspace/Codex/archive-2026-09-09/`. Blocks start from a fresh worktree off
   `origin/v2`.
7. **The handoff is one file plus a five-line prompt.** [`NEXT.md`](NEXT.md) is the only handoff;
   contracts are never copied into prompts, and it is identical for Claude and Codex.
8. **The 9 September feedback becomes an open block, PD, before P11a** (below, and in
   [`PROGRAM.md`](PROGRAM.md)). P11a does not start before the owner's verdict on PD.
9. **Only the manifest and the curated screenshots enter the repository.** The HTML lab stays at
   `~/Workspace/Codex/d20-design-dialogue`, named by path; closed-block evidence is archived under
   `~/Workspace/Codex/archive-2026-09-09/`, never deleted.

## 2026-09-09 — engagement, progressive disclosure and raster art

<!-- source: product-memory/2026-09-09-owner-feedback-coinvolgimento.md -->

- **The experience is too cold.** P10 feels "troppo fredda, distaccata e amministrativa", like a
  bank's back office: creating a character answers "mancano i campi", "come una pratica alle poste".
  The mock was chosen above all for the battle map, the bridge and those colours; approving it did
  not approve every management surface derived from it. Folio must be lived as a game in a browser.
- **Progressive disclosure, both sides.** The expert acts fast with no mandatory explanation slowing
  him down; the curious beginner can investigate, understand what a choice means and learn while
  playing. Neither costs depth. Research is requested, with BG3 and D&D Beyond actually studied as
  **primary and binding** references.
- **Raster art.** Ideally every spell and, where it makes sense, every combat content or action
  carries a small artistic raster image in the language of the mock's spell art — the spells,
  explicitly not the weapons. Not more generic icons and not ad-hoc SVG pictograms, whose quality
  the owner rejected; curated, contemporary, rich without being gaudy.
- **Short handoffs.** End-of-session prompts were long because contracts and history were copied
  inline; that requirement is dropped for a short handoff kept in documents.

## 2026-09-08 — standing delivery delegation

<!-- source: PRODUCT.md, "V2 delivery and owner review — 8 September 2026" -->

- **Delegated implementation acceptance.** Reviewed, gate-green work implementing the approved mock
  and the agreed contracts integrates into `v2` without a fresh exhaustive screenshot approval at
  every block; curated actual screenshots and the successor handoff remain mandatory, and the
  detailed hands-on review happens when the application is complete. Ask only for a new material
  product decision, or for separately gated production, deployment, migration or cost.
- **Clarity and familiar interaction patterns.** The same depth and contextual control must be
  understandable everywhere — homebrew forms, creation and growth, campaign management, play. Users
  must know where they are, what a term or control means, what they can do and what a choice will
  change. Internal data structures are never prerequisites for use; clarity never reduces depth.
- **Interim acceptance of P06:** "per il momento mi sembra che vada bene" — broad, not a claim
  that every control was inspected.

## 2026-09-07 — custom automation, editable combat, shell and Account

<!-- source: PRODUCT.md "Reconciled owner direction"; shell-review-20260907/DECISIONS.md -->

- **Custom is a first-class input to the same engine.** Custom content drives actions, targets,
  costs, resources, effects, reactions and consequences through the shared mechanics and receipt
  model, never a parallel descriptive catalogue. During play the table changes relevant values,
  resources, conditions, effects and results on the authoritative facts, with provenance and causal
  correction — never a decorative override, never a silent rewrite of an in-use copy's template.
- **Shell and Account, r2.** Account under the player's name; global search on desktop, a lens on
  the phone; a `?` for help and shortcuts. No switch to disable shortcuts or animations — they are
  part of the experience and are not to be proposed again. Direct IT ↔ EN switching, the button
  naming the destination language. Preferences are game-oriented: digital or physical dice,
  changeable at the table. Account navigation persists across its seven sections; fonts, palette
  and assets stay untouched outside the agreed delta.
- **Delivery preference:** "mandami il prompt per la prossima sessione solo quando hai davvero
  finito."
- **Verification loop.** Every block iterates on the actual running application — journeys, UI,
  persisted effects, failures reproduced and fixed — with independent authenticated clients and the
  optimized build on Firebase demo emulators. Emulator acceptance never authorises deployment.

## 2026-09-06 — V2 is a new application

<!-- source: PRODUCT.md, "Owner rectification — new V2 application, 6 September 2026" -->

- **Rebuilt from zero:** "è un'applicazione completamente nuova", "stiamo buttando tutto a terra e
  ricostruendo da zero". Existing code, routes, tests and screenshots are diagnostic history, never
  the design baseline. Astra has technical and architectural discretion. No legacy combat bridge;
  production keeps running separately and its data is only the input to a recoverable migration.
- **The binding reference is the approved mock `d20-folio-html-0.9.3-2026-09-06`**, receipt in the
  external REVIEW journal, passage 29; it is not a ceiling on depth. The light-theme screenshots are
  withdrawn, and so is the request to approve the 28 legacy screenshots of the old P02 candidate.
- **Depth is delegated to the implementation blocks:** "Se la profondità è rimandata a quando quei
  prompt di implementazione verranno attualmente eseguiti allora va bene."
- **Push authorisation.** Agents may push without asking each time, in particular on `v2`, and
  integrating V2 work needs no owner code review. A push is not a deploy.
- **Only the necessary, and all of the necessary.** Avoid information overload, expose the essential
  simply, and do not offer several competing ways to do the same thing.

## 2026-09-05 — visual base, brand and dark only

<!-- source: product-memory/PRODUCT-MEMORY.md §12–§13 -->

- **immersive-v2 is the accepted visual base:** "un ottimo punto di partenza", to be developed
  rather than replaced by new unrelated directions. It is not approval of every screen.
- **The name d20 Folio and the D20 die in the mark are confirmed** after the owner reopened the
  question and delegated it.
- **Dark theme only, IT and EN.** The owner authorised removing the light theme if it was not done
  well and Astra chose dark only; light paper remains for printing. Reaffirmed in the 6 September
  reconciled direction and reconciled in P01.
- **Ambition:** every useful capability of Owlbear, D&D Beyond, BG3 and the other tools inside
  Folio — but "Tutti gli strumenti di gioco; Discord resta per parlare".
- **Corrections to keep:** shadows on items, never a decorative halo; the HP arc and every bar go
  green → yellow → red; "Correggi" needs an intuitive icon; allowed and extra movement and Dash's
  cost stay visible.

## 2026-09-03 — steering, method, dice and CI

<!-- source: PRODUCT.md §Steering; docs/superpowers/plans/2026-09-03-new-app-stage-1.md -->

The purpose, the ambition, the four acceptance stories and the nineteen jobs are owned by
[PRODUCT.md](../../PRODUCT.md) §Steering; the decisions below are the ones this program enforces.

- **Giants' shoulders:** every screen, component, model and workflow is copied from the state of the
  art with real evidence and then improved, never invented. "Nani sulle spalle dei giganti."
- **Dice reversal.** The app now rolls: in-app 3D dice everyone sees, or real dice with the result
  entered, chosen per person. This reverses the old no-dice-rolling rule.
- **CI must be fast.** The portfolio is rebuilt with the new app; the old end-to-end suites, almost
  an hour per run, are not carried over. The gate keeps unit and rules tests, the golden replays,
  one accessibility sweep and the screenshot suite, under 15 minutes.
- **No dead weight.** Everything on `v2` has a reason and a named fate — keep, rebuild in stage N,
  or delete now. Dead code dies when it is dead, never "at stage 7".
- **Admin-supreme account** (settled in stage 4): the admin is not an implicit member of every
  campaign; the owner's account joins his group's campaign and `role == "admin"` carries DM-level
  rights. **Out-of-combat mechanical freedom is still open:** players resolve spells and other
  mechanics outside a formal encounter, as D&D 2024 allows.

## 2026-09-02 — architecture round

<!-- source: docs/adr/0001, 0002, 0005, 0006, 0010, 0011 -->

One entity-generic reducer over an append-only Encounter log; one mechanics authoring format;
Firestore rules enforce access, never gameplay; rolls are log actions behind a dice seam; the three
campaign automation levels are application policy. The mechanics kernel is not adopted.
