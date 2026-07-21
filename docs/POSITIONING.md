# Competitive positioning — where d20 Folio stands vs D&D Beyond

> **The one-page north star.** The lane the product occupies, the moat we cannot cross, and the
> opening we are built for. This is the **why / where**; `PROGRESS.md`'s _"Ratified epic — The
> DDB-parity frontier"_ is the **what / when**.
>
> Verified **2026-07-21**. Re-verify the _Landscape_ and _Where we're behind_ sections whenever
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
- **Full form-swap** (Wild Shape / Polymorph, 91 beast forms) — the beast's own CON drives the
  concentration save. DDB does not model transformation stat-blocks on the sheet.
- **Damage-intake + dying automation** — RAW resistance/vulnerability/immunity order, 0 HP applies
  Unconscious + auto death-save failures + massive-damage instant death, roll-entry death saves.
- **Offline-first** (Firestore persistence + service worker) — a felt DDB weak point.
- **Bilingual EN + IT** — DDB is English-first and structurally under-invests here.
- **Free + complete _within the SRD_** — no paywall, no per-book à-la-carte.
- **No AI, deterministic-by-construction** — a _trust_ differentiator as DDB leans into AI.

## Where we're BEHIND — all on the DM / content side

This entire list **is the ratified epic** (`PROGRESS.md` → _"Ratified epic — The DDB-parity
frontier"_), sequenced **bestiary-first**:

- **No monster bestiary / encounter picker** — the epic flagship. Unlocks the encounter picker, a
  **2024-DMG XP-budget difficulty calculator** (DDB's standalone tool is stuck on 2014 math — we can
  be _more correct_, not just level), the compendium Monsters section, and companions.
- **No homebrew authoring** — the planned ladder (account library → campaign sharing → monster
  editor → species/feats/subclasses) ends at **homebrew classes**, declared the _horizon flagship_
  because it is D&D Beyond's #1 refused community ask, and our grants seam can actually do it well.
- **No public share links yet** — model decided (`shared: true` flag + unguessable doc id).
- **The permanent, un-closeable cap: official non-SRD content.** DDB is the only legal home for the
  ~75%+ of subclasses/species/feats/spells/adventures that are _not_ in SRD 5.2.1. A CC-BY app is
  permanently bounded to the SRD subset. **We do not try to close this** (see _The moat_).

## The deliberate non-goals — never "behind," always chosen

- **No battle map / VTT surface, ever** (Constitution §2.9). The one permanent DDB gap, _owned_ as
  "bring your own VTT" (the owner's table plays on Owlbear Rodeo; a pure in-person table must work too).
- **No dice rolling, ever** (golden rule 21) — show formulas + roll-entry; users roll externally.
- **No AI / LLM assistant** (Constitution v1.7, owner-ratified 2026-07-06) — the deterministic engine
  _is_ the intelligence; do not re-add.

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
what keeps this door open without forcing a choice now. A commercial build would also have to avoid
the D&D / WotC trademarks (brand as its own thing; "5e / SRD-compatible" wording only).

**Current posture — "Option A" (owner, 2026-07-21):** build a genuine _masterpiece_ for the owner +
friends + whoever finds the public repo; stay free and zero-budget; keep the pack private forever.
Monetization is a possible someday, never a driving goal.

## Sources

The internal competitive audit (`PROGRESS.md` → the DDB-parity epic) plus a July-2026 landscape
verification:

- D&D Beyond subscription / "Drops" pivot — <https://www.dndbeyond.com/posts/2187-d-d-beyond-drops-update-on-the-program>
- Sigil 3D-VTT shutdown — <https://www.dndbeyond.com/posts/2086-closing-the-chapter-on-sigil-and-thanking-the>
- SRD 5.2.1 under CC-BY-4.0 — <https://www.dndbeyond.com/srd>
