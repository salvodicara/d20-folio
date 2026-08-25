# Tactical Codex visual atlas

This directory preserves the approved Tactical Codex direction as versioned design evidence. The
boards are original generated PNG files at their native dimensions, copied without recompression and
kept outside the application bundle.

The atlas is the visual target for implementation, not a collection of bitmap UI assets. Product
behavior remains owned by the product constitution, product map, domain model and real application
states. Text, numbers and affordances inside a concept board are illustrative unless the owning
product document also requires them.

## Authority order

1. **A00** owns the global shell, navigation, responsive retreat and identity.
2. **B00** owns typography, icon geometry, color, art taxonomy, crops, fallbacks and provenance.
3. **B01** owns motion phases, focus return, interruption and reduced-motion behavior.
4. The remaining A and S boards own their surface anatomy and state coverage while inheriting A00,
   B00 and B01.
5. The rendered application in authenticated Chrome is the final proof. A deviation from the atlas
   must improve accessibility, real content fit or product correctness, remain system-wide and pass
   the screenshot approval gate.

The coded prototype is only an interaction and responsive-layout spike. It currently reuses the
repository's Alegreya scaffolding and Lucide icons, while B00 specifies Newsreader Variable, Inter
Variable and an original 24 px outline icon grammar. That mismatch is expected in the spike but is
not acceptable as the production visual baseline.

## Board inventory

| Board   | Scope                                                        | Native reference                                                       |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A00     | Canonical desktop/mobile shell and immersive encounter shell | [A00 shell](boards/A00-shell-canonica.png)                             |
| A01     | Access, invitations, public sharing, recovery and errors     | [A01 access](boards/A01-accesso-condivisione-recupero.png)             |
| A02–A03 | Character roster, import and destructive data actions        | [A02–A03 characters](boards/A02-A03-personaggi-import-azioni-dati.png) |
| A04–A09 | Character creation and level-up overview                     | [A04–A09 growth](boards/A04-A09-creazione-crescita.png)                |
| A05–A06 | Character cockpit roles, edit-in-place and five anatomies    | [A05–A06 cockpit](boards/A05-A06-cockpit-cinque-anatomie.png)          |
| A07     | Resources, active effects, companions, auras and status      | [A07 resources](boards/A07-risorse-stati-effetti.png)                  |
| A08     | Unified ActionFlow and external-input resolution             | [A08 ActionFlow](boards/A08-actionflow-unificato.png)                  |
| A10     | Multi-campaign roster, creation, joining and invitations     | [A10 campaigns](boards/A10-campagne.png)                               |
| A11     | Campaign workspace, roles and character attachment           | [A11 campaign workspace](boards/A11-workspace-campagna-ruoli.png)      |
| A12     | Chronicle, sessions, notes, treasury and campaign management | [A12 records](boards/A12-diario-sessioni-note-tesoro.png)              |
| A13     | Full encounter lifecycle for player and DM                   | [A13 encounter](boards/A13-ciclo-incontro.png)                         |
| A14     | Compendium, bestiary and Homebrew entry points               | [A14 compendium](boards/A14-compendio-bestiario-homebrew.png)          |
| A15     | Settings and role-gated administration                       | [A15 settings](boards/A15-impostazioni-amministrazione.png)            |
| A16     | Dialogs, sheets, searchable pickers, payments and popovers   | [A16 overlays](boards/A16-dialoghi-sheet-picker-popover.png)           |
| S01     | Detailed session planner and calendar                        | [S01 session planner](boards/S01-session-planner-calendar.png)         |
| S02     | Typed Homebrew Studio with preview and mobile composition    | [S02 Homebrew Studio](boards/S02-homebrew-studio.png)                  |
| B00     | Asset Bible: identity, fonts, icons, art and tokens          | [B00 Asset Bible](boards/B00-asset-bible.png)                          |
| B01     | Motion Bible: frame-by-frame interaction states              | [B01 Motion Bible](boards/B01-motion-bible.png)                        |

## Image-to-code contract

Implementation proceeds system-first, never by approximating one screenshot in isolation:

1. extract the B00 tokens, font metrics, icon grid, spacing and component anatomy;
2. produce licensed font files and original SVG logo/mechanics icons as source assets;
3. build the A00 shell and shared primitives in both desktop and mobile compositions;
4. implement one vertical slice at a time with real data and the canonical ActionFlow;
5. capture dark/light, IT/EN, desktop/mobile and all meaningful loading, empty, busy, error, offline
   and permission states;
6. compare rendered screenshots against the relevant board and inspect every B01 animation at entry,
   mid-transition, settled, interrupted, exit and reduced-motion frames;
7. integrate only after the curated screenshots are approved and the old visual path for that slice
   is removed.

Do not ship these board PNGs in the runtime, trace proprietary third-party assets, or preserve an old
component merely because the prototype used it. The goal is a coherent implementation of the visual
system, not a collage of screenshots.
