# Visual reference

The approved reference for every v2 surface is the frozen HTML mock
**`d20-folio-html-0.9.3-2026-09-06`**, plus the shell and Account corrections of 7 September 2026.
Compare a runtime against these, never against a general resemblance.

## The manifest

[`mock-0.9.3-manifest.json`](mock-0.9.3-manifest.json) is a verbatim copy of the lab's
`RELEASE-MANIFEST.json`. It identifies the freeze exactly:

- `tag` — `d20-folio-html-0.9.3-2026-09-06`.
- `files` — 523 entries, each with the SHA-256 of its raw bytes.
- `contentRootSha256` — `5cbf9662ebd76f9a1790371bd8dda69d56bb127fd5e1c322d56832ac212a5843`, the
  SHA-256 of the canonical JSON of that file map.
- `verificationCommand` — `python3 freeze-candidate.py --verify`, run inside the lab folder.

A tag or a hash identifies a candidate; it never closes a gate on its own. The manifest's `status`
and `ownerApproval` fields are the lab's own state at freeze time and are superseded by the owner's
approval of 2026-09-06 recorded in [`DECISIONS.md`](../DECISIONS.md).

## The lab itself is not committed

The HTML laboratory lives at `~/Workspace/Codex/d20-design-dialogue/full-lab`, and the shell review
at `~/Workspace/Codex/d20-design-dialogue/shell-review-20260907`. They are named by path and stay
outside the repository: they carry licensed and third-party assets that the public repository must
not distribute. Open them locally when a block needs a surface this folder does not cover.

## The committed screenshots

[`screenshots/`](screenshots) holds fourteen curated WebP captures — the approved reference for the
surfaces they show, converted from the lab PNGs with `cwebp` and kept under 150 KB each.

| File                               | Surface                                 |
| ---------------------------------- | --------------------------------------- |
| `01-campaign-1440.webp`            | Campaign hub, 1440                      |
| `02-character-1440.webp`           | Character sheet, 1440                   |
| `03-inventory-1440.webp`           | Inventory, 1440                         |
| `04-target-1440.webp`              | Combat targeting, 1440                  |
| `06-applied-1440.webp`             | Applied outcome, 1440                   |
| `07-correction-1440.webp`          | Causal correction, 1440                 |
| `hud-slots-it-1440.webp`           | Play HUD with spell slots, IT           |
| `dm-workspace-desktop.webp`        | DM workspace, desktop                   |
| `final-review-calendar-1440.webp`  | Calendar and availability, 1440         |
| `screen-account-it-dark-1440.webp` | Account, IT dark, 1440                  |
| `character-390.webp`               | Character sheet, phone                  |
| `nav-phone.webp`                   | Navigation, phone                       |
| `r2-preferences-desktop.webp`      | Shell r2 — Account preferences, desktop |
| `campaign-desktop.webp`            | Shell r2 — campaign screen, desktop     |

[`shell-r2-decisions.md`](shell-r2-decisions.md) carries the owner's corrections that r2 applies.

## What is not a reference

The light-theme screenshots are **withdrawn**: the theme is dark only, IT and EN, and light paper
exists only for printing. The 28 legacy screenshots of the earlier P02 candidate are withdrawn too.
Any other lab evidence not listed in the manifest's `files` is historical and unfrozen.
