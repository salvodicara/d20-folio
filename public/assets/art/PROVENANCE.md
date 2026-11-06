# Painted icons — provenance and rights (generated from 2026-11-05)

**Tool and cost.**

- Generated with the built-in `image_gen` tool of the owner's Codex app (`codex-cli 0.164.0-alpha.11.1`, bundled in ChatGPT.app), driven non-interactively with `codex exec`, the same route as the room backgrounds (`docs/design/prototype/img/rooms/PROVENANCE.md`).
- Codex is signed in with the owner's ChatGPT account ("Logged in using ChatGPT") and holds no OpenAI API key, so each image uses the ChatGPT plan's included usage and nothing is billed per call. `scripts/image_gen.py` (billed API) was not used.

**Rights.**

- Under OpenAI's terms of use, the user owns the output generated with their account.
- Prompts describe original icons from public SRD 5.2.1 names and the first sentence of their SRD text (CC BY 4.0). They name no franchise, artist or studio asset; "in the spirit of the BG3 spell and item icons" describes a genre.
- The only image given to the generator is a sheet of the owner-approved prototype icons (`docs/design/prototype/img/icon-*.webp`, `class-*.webp`), as the style reference.
- Private-pack entries are not here: their icons live with the pack.

**Style.** One shared style block for every icon: one central subject, painterly brushwork, glowing in a key colour (the spell's school or damage type, the item's rarity), near-black vignette, no text, frames or logos. Style approved by the owner on a 20-icon sample (2026-11-05).

**Files.**

- `<kind>/<id>.webp` with `kind` one of spell, class, subclass, feat, item, equipment, monster, feature, species, action and `id` the catalogue id (`tests/unit/art-assets.guard.test.ts` checks every file names an entry).
- WebP q80, 192 × 192 (256 × 256 for class and subclass crests), from 1024 × 1024 PNG masters kept in the owner's archive (`~/Workspace/Codex/folio-icone-2026-11-05/`, with every prompt and a manifest), never in the repo.
- Never precached: the service worker caches each icon on first view (`icon-art-cache`, 400 entries).
