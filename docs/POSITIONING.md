# Competitive positioning — where d20 Folio stands vs D&D Beyond

> **The one-page north star.** The lane the product occupies, the moat we cannot cross, and the
> opening we are built for. This is the **why / where**; `PROGRESS.md`'s _"Active epic — The
> DDB-parity frontier"_ is the **what / when**.
>
> Verified **2026-07-21**; posture amended **2026-07-31** (the GA trajectory — see _Can this ever
> be monetized?_). Re-verify the _Landscape_ and _Where we're behind_ sections whenever
> D&D Beyond ships a major change.

## The lane, in one breath

d20 Folio is the definitive **free, offline-first, bilingual (EN + IT) character-and-campaign
companion** for D&D 2024, with a **deterministic rules engine as its intelligence** (no AI). It
**complements a virtual tabletop and serves a pure in-person table — it is never itself a VTT**
(Constitution §2.9). It does **not** compete with D&D Beyond on content breadth (a fight it cannot
win — see _The moat_). It competes, and wins, on **correctness, craft, trust, and price**.

## The verdict (competitive audit, owner-ratified 2026-07-17)

**Ahead on the player / sheet experience; structurally behind on the DM / content side.** The owner
ratified closing everything on the content/DM side **except the deliberate non-goals**. The
architecture is the reason we're ahead: every mechanic-bearing fact is a typed `Grant`, aggregated
by `evaluateGrants` and read by the sheet — and **D&D Beyond's own 2026 roadmap is rebuilding
_toward_ "rules as data," the architecture this app already has.**

## Where we're AHEAD of D&D Beyond

- **Deterministic recompute + universal override.** Every derived value (AC, PB, spell DC, attack,
  passives, saves, speed, HP, initiative) auto-computes _and_ carries a manual override. DDB's
  override surface is far shallower.
- **Buffs that flow across every surface** (seams S1/S5). Cast Shield → its chip auto-lights →
  +5 AC reaches the displayed AC, medallion, inventory, PDF, and roster snapshot by construction;
  concentration-drop / 0 HP / expiry auto-retract it. DDB makes you toggle buffs by hand.
- **Riders on the exact attack row** (S2) — Sneak Attack, Divine/Blessed Strike, GWM +PB — rendered
  inline with one-tap resource debit, never left to memory.
- **Multiclass correctness DDB gets subtly wrong** — owning-class tracker scaling, separate
  Pact-Magic vs normal slot pools, half-casters rounding up, per-spell DC keyed to the owning class.
- **Full form-swap** (Wild Shape / Polymorph, 84 beast forms) — the beast's own CON drives the
  concentration save. DDB does not model transformation stat-blocks on the sheet.
- **Damage-intake + dying automation** — RAW resistance/vulnerability/immunity order, 0 HP applies
  Unconscious + auto death-save failures + massive-damage instant death, roll-entry death saves.
- **Offline-first** (Firestore persistence + service worker) — a felt DDB weak point.
- **Bilingual EN + IT** — DDB is English-first and structurally under-invests here.
- **Free + complete _within the SRD_** — no paywall, no per-book à-la-carte.
- **No AI, deterministic-by-construction** — a _trust_ differentiator as DDB leans into AI.

## Where we're BEHIND — all on the DM / content side

This entire list **is the active epic** (`PROGRESS.md` → _"Active epic — The DDB-parity
frontier"_), sequenced **bestiary-first**:

- **Bestiary + encounter picker + difficulty calc all SHIPPED (2026-07-24/25)** — the epic
  flagship, fully delivered. The **bestiary**: the full **330-creature SRD 5.2.1 bestiary**
  (bilingual) + the **compendium Monsters section** (statblock plaque, CR/size/type facets) ship
  in-repo, and the beast catalogue is re-derived to 2024 (84 Polymorph forms). The **DM-side tooling
  that consumes it**: the **encounter picker** (replacing the type-by-hand AddMonsterForm) and the
  **2024-DMG XP-budget difficulty calculator** — the DM-only budget readout in the encounter round
  bar & Add-monster modal, driven by the pure `encounter-difficulty.ts` SRD-table engine, with a
  custom-monster CR select and a lair-XP toggle. We are **_more correct_ than DDB here, not just at
  level**: DDB's standalone encounter tool is stuck on 2014 per-count multiplier math and four
  tiers, while we implement the 2024 procedure exactly — no multipliers, three grades. The pack-side
  MM statblock corpus advances along the same manifest.
- **Homebrew — the ladder's first rung SHIPPED (2026-07-30):** the account-level library (rung (a)
  — every per-character custom spell/feature/equipment silently kept as a reusable account doc,
  "custom IS the library"). The remaining rungs stand: campaign sharing → monster editor
  (a reusable custom-monster library — "custom IS the library" applied to monsters, plus override-first
  monster portraits — is the CONFIRMED first cut, owner-ratified 2026-08-01) → species/feats/subclasses → **homebrew classes**, the declared _horizon flagship_ because it is
  D&D Beyond's #1 refused community ask, and our grants seam can actually do it well.
- **Quickbuild parity SHIPPED (2026-07-30)** — DDB shipped "Quickbuilder" March 2026; Quick Start
  now opens on a complete, legal, class-recommended build (only the name left to type) **plus the
  seeded Randomize reroll DDB does not have** — matched, then exceeded.
- **Public share links SHIPPED (2026-07-31) — characters only, and we land it better than DDB.** A
  `shared: true` flag on the character doc turns its unguessable document path into a public
  read-only sheet: no account, no sign-up wall, the FULL sheet (DDB's public sheet is a stripped
  view), revoked by flipping the flag. Handing it over is one tap into the phone's native share
  sheet — WhatsApp / Telegram / iMessage for free — with copy-link as the universal fallback, and the
  campaign INVITE link now rides the same affordance. Both link families unfurl with real Open Graph
  previews ("Lyra Voss — Level 11 Bard / Fighter", "Join Starless Keep on d20 Folio") off a
  rewrite-fronted Cloud Function. **Campaigns deliberately keep NO anonymous share model** (industry
  standard — a table shares via each player's own character).
- **Post-view signup CTA (CANDIDATE, owner idea 2026-07-31)** — the **acquisition growth-loop close
  on the share funnel**: the public no-account `/view` page offers a tasteful, premium post-view
  nudge to "create your own character" / sign up, converting the traffic share links + advertising
  generate into new users. Depends on share links (above), complements first-run onboarding, and
  must stay a nudge (never a nag) while non-registered viewing always works with or without it.
  Priority is the owner's call — charter in `PROGRESS.md` → _DDB-parity frontier_.
- **Deterministic combat log (CANDIDATE, owner idea 2026-07-31)** — an auto-generated mechanical
  encounter log (HP math, who-hit-whom, dying, round advancement) event-sourced from the actions
  already flowing through the shipped encounter/initiative tracker, appended to the campaign at
  encounter-close. Not a gap-closer but a **DDB-parity-PLUS** move (DDB has nothing comparable): it
  frees the DM from bookkeeping transcription for narrative notes, needs no AI and no dice, and is
  the budget-safe reframing of the parked "Table feed" (the encounter boundary replaces per-action
  writes). Priority is the owner's call — charter in `PROGRESS.md` → _DDB-parity frontier_.
- **The permanent, un-closeable cap: official non-SRD content.** DDB is the only legal home for the
  ~75%+ of subclasses/species/feats/spells/adventures that are _not_ in SRD 5.2.1. A CC-BY app is
  permanently bounded to the SRD subset. **We do not try to close this** (see _The moat_).

## The deliberate non-goals — never "behind," always chosen

- **No battle map / VTT surface, ever** (Constitution §2.9). The one permanent DDB gap, _owned_ as
  "bring your own VTT" (the owner's table plays on Owlbear Rodeo; a pure in-person table must work too).
- **No dice rolling, ever** (golden rule 21) — show formulas + roll-entry; users roll externally.
- **No AI / LLM assistant** (Constitution v1.7, owner-ratified 2026-07-06) — the deterministic engine
  _is_ the intelligence; do not re-add.
- **No internet/wiki monster ARTWORK, ever** (LEGAL, owner-ratified 2026-08-01) — pulling WotC/wiki/
  artist monster art off the internet is copyright infringement (SRD CC-BY licenses stats/text ONLY,
  never the art) and breaks the SRD-clean boundary below. Legal monster visuals only: a legal-art
  default (verified PD/CC where it matches + owner-generated pack art) with an ALWAYS-available
  user-upload override (the user owns their content), the SAME model as character portraits — never
  scraped. Captured in `PROGRESS.md` → the DDB-parity charter's homebrew-ladder **override-first
  monster portraits** confirmed rung.

## The moat vs. the opening

**DDB's durable moat is legal ownership of the official corpus, not software quality.** No amount of
engineering closes it — so we do not fight on breadth.

**The opening (2026 landscape, verified 2026-07-21):**

- DDB pivoted to **subscription-first "D&D Beyond Drops"** (weekly, subscriber-gated, not in physical
  books) → **paywall fatigue** and backlash. → _free + complete-within-SRD_ is a real value prop.
- **Sigil (the 3D VTT) is shutting down** (servers off end of October 2026); DDB is _retreating_ from
  the VTT arms race we deliberately never entered. → our "not-a-VTT, brilliant companion" bet is
  where the wind is going.
- DDB is **English-first, online-first, PDF-only export**, and leaning into **AI** in ways that make
  a chunk of the base uneasy. → _offline-first, bilingual, no-AI-trust_ map straight onto these gaps.

## Can this ever be monetized?

Yes — but **only ever the SRD-clean public build.** SRD 5.2.1 is **CC-BY-4.0**, so commercial use is
permitted _with attribution_ (and it excludes Product Identity creatures — the reason the licensing
guard's denylist exists). **The private content pack carries non-SRD WotC content and can never be
monetized or redistributed — personal + friends use only.** The public/private repo split is exactly
what keeps this door open without forcing a choice now. [Soft-launch amendment, owner 2026-08-02:
for the free community beta the owner ACCEPTED (informed override, surfaced) that the publicly
posted hosted instance is the COMPOSED build, so signed-in strangers can reach pack content; the
boundary above still governs everything monetization-shaped, and the documented fallback — the
public URL goes SRD-only, friends move to an unadvertised second Hosting site — stands ready if a
takedown ever arrives. The ruling + checklist live in `PROGRESS.md` → the soft-launch charter.] A commercial build would also have to avoid
the D&D / WotC trademarks (brand as its own thing; "5e / SRD-compatible" wording only).

**The ratified trajectory (owner, 2026-07-31): the destination is GA.** "Option A" (owner,
2026-07-21) — build a genuine _masterpiece_ for the owner + friends + whoever finds the public repo;
stay free and zero-budget; keep the pack private forever — is the **current phase**, not the end
state. At some point the SRD-clean public build goes **generally available and competes with
D&D Beyond head-on**, so it is crucial we are **objectively better** — on correctness, craft, trust,
and price. The content moat is neutralized on both sides of the split: the **private pack**
(personal, forever-private) closes it for the owner's table, and the **homebrew ladder is the
public answer** — users author what licensing forbids us to ship. The bar is absolute: everything
perfect and premium — no bug or weird UI/UX can be afforded (golden rule 27). The **pre-GA
checklist** (parked now, blocking GA later; fleshed out 2026-07-31) lives in `PROGRESS.md` → the
DDB-parity charter's 2026-07-31 owner amendment. The monetization **shape** is ratified (owner,
2026-07-31): **core free forever, self-hosting free, a cheap supporter/premium tier on the hosted
instance only** — still never a driving goal, and the boundary above stands unchanged: only ever
the SRD-clean public build.

## Sources

The internal competitive audit (`PROGRESS.md` → the DDB-parity epic) plus a July-2026 landscape
verification:

- D&D Beyond subscription / "Drops" pivot — <https://www.dndbeyond.com/posts/2187-d-d-beyond-drops-update-on-the-program>
- Sigil 3D-VTT shutdown — <https://www.dndbeyond.com/posts/2086-closing-the-chapter-on-sigil-and-thanking-the>
- SRD 5.2.1 under CC-BY-4.0 — <https://www.dndbeyond.com/srd>
