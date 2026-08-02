---
"d20-folio": minor
---

**Relicense the app code MIT → AGPL-3.0** (owner, 2026-08-02): the full AGPL-3.0
text replaces MIT in `LICENSE` (copyright retained), `package.json` `license` is
now `AGPL-3.0-or-later`, and the README badge + license section and the `/legal`
license register are updated to match. **The SRD game content is untouched — it
stays CC-BY-4.0** (the licensing partition is unchanged): `/legal` now reads app
code = AGPL-3.0, SRD content = CC-BY-4.0.

Re-cut the `/legal` trademark register into an open, quotable **nominative
disclaimer** (owner R3, 2026-08-02: saying the tool is _for_ D&D is fine as
nominative fair use): the page now states plainly "d20 Folio is an independent
companion for Dungeons & Dragons 2024 · not affiliated with, endorsed, sponsored
by, or created by Wizards of the Coast · Dungeons & Dragons, D&D, and their logos
are trademarks of Wizards of the Coast LLC" — the marketing-usable line, rendered
as an emphasized plaque (a new `.colophon-disclaimer` treatment, no marks/logos/
trade dress). "The App" copy opens to "for Dungeons & Dragons 2024" to match.

Also make the Privacy Policy accurate: the sharing clause now discloses the two
flows that reach outside services — an in-app bug report opens a GitHub issue, and
a first sign-in emails the owner a new-user notice — replacing the inaccurate
"never hand it to third parties" wording with "never sell your data or hand it to
advertisers." EN + IT in parity; the legal-page unit lock pins the open disclaimer.
