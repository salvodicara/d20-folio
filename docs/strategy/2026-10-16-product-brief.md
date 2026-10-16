# d20 Folio — product brief (2026-10-16)

Owner decisions of 2026-10-16, taken in the strategy session. This brief replaces
`docs/PRODUCT_CONSTITUTION.md` and `docs/POSITIONING.md` (retired 2026-10-16, in git history) and
VISION's "per noi, non commerciale"; `PRODUCT.md` is its design-facing summary for the `impeccable`
skill. `docs/VISION.md` keeps the
interaction decisions; `docs/GOLDEN_RULES.md` keeps taste and way of working. Evidence:
[research and audit](2026-10-16-research-and-audit.md).

## The decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **User:** beginners everywhere, Italian and international: players in their first campaigns and first-time DMs. Multilingual by design: more languages later. Every value is explained with a breakdown, more clearly than D&D Beyond.                                                                                                         |
| 2   | **Promise:** "Roll your own dice: Folio does the maths, explains every number and writes the session report." (IT: «Tira i tuoi dadi: Folio fa i conti, ti spiega ogni numero e scrive il resoconto della sessione.»)                                                                                                                          |
| 3   | **Never:** a VTT (maps, tokens, video); AI inside the app. **Not yet:** digital dice. Input-only today; the architecture must make adding them later easy.                                                                                                                                                                                     |
| 3b  | **All 2024 rules supported, without legal risk.** See _Content and licensing_.                                                                                                                                                                                                                                                                 |
| 4   | **Price:** everything free for now, with a donation link. A small subscription (around €1.50/month) may come later to cover running costs if users grow. Not designed now.                                                                                                                                                                     |
| 5   | **Account required.** No guest mode. Sign-up is one tap: Google or a passwordless email link. Demos are videos plus an illustrated guide.                                                                                                                                                                                                      |
| 6   | **Name:** "d20 Folio" is the working name; the owner is lukewarm on "Folio". A second, collision-checked "d20 + word" round comes before the public launch. Name and logo live in one swappable place.                                                                                                                                         |
| 7   | **Look:** redone completely, beautiful on phone and laptop. **Direction B, "BG3 fantasy ricco"**: dark stone, gold leaf, engraved Cinzel capitals, Alegreya reading text. It was chosen over a modern-game look and a light one, shown on the same Play screen. Legibility for beginners comes before ornament. "The devil is in the details." |

## How we build features (owner 2026-10-16)

Don't reinvent. For each feature:

1. First look at how D&D Beyond, Foundry dnd5e, Roll20 and Owlbear already solve it, and copy the
   established pattern.
2. Then beat it on Folio's three axes: clarity, simplicity, and explaining everything.

The measure is a player in their first campaign, or a DM running their first one (GOLDEN_RULES,
taste #1).

## Positioning

Folio is the **companion that explains D&D 2024 while you play**, at a real table or next to
Owlbear and other VTTs. D&D Beyond is a reference website with a paywall, English-only tools and no
recap. VTTs roll the dice for you and assume you play online. Recap tools record audio and charge for
AI. Folio is free, works in your language, keeps your real dice and builds the session report from
what the group declares.

## Three strengths to amplify

1. **Clarity.** Every number opens into its sources: AC 18 = chain mail 16 + shield 2. Every rule
   term has a plain explanation in the player's language. This is the beginner's reason to choose
   Folio and the first thing an ad shows.
2. **One-tap play.** Filters by action, bonus action and reaction; slots and resources spent by
   themselves; buffs and timers that switch off on their own; override everywhere. This is what the
   owner's groups already love.
3. **The session writes itself.** Every member's actions in the same campaign land in one log. The
   log becomes a deterministic report per round, ready to give to an AI for the summary. Members who
   do not use the app still appear, because the DM declares for them.

## Content and licensing: how Folio supports every rule

- **Public:** SRD 5.2.1 (CC-BY-4.0), bundled, with the attribution sentence. Commercial use is
  allowed. There is one subclass per class, plus a few backgrounds and feats.
- **Homebrew for everything:** the same Grants and Actions the official content uses. A user can
  model any rule, including one from a book they own. It stays private to their account and their
  campaigns. Never a public catalogue.
- **Bring your own pack:** a user can import a content file they have into their own account, never
  served to anyone else. Foundry and Fight Club 5e work the same way.
- **The private `content-pack/`:** for the owner's groups. The runtime pack is built and ready
  (#296, #300): the public bundle can ship SRD-only while accounts with the `pack` claim download
  the pack from protected storage. **Owner decision 2026-10-16: not switched on yet.** "For now I
  wouldn't complicate things; make everything available to everyone." Until the switch, the live
  bundle carries the non-SRD text (198 built files; any visitor can read it in the site's
  JavaScript) and public share links show it to anyone. That is the legal exposure fan apps get
  taken down for. It stays acceptable while Folio is a private group tool, and it **blocks the
  public launch** (phase 5): the switch is a deploy with `runtime_pack=true` after the claims are
  granted.
- **Monster and item art is original.** Never scraped from the internet or copied from the books:
  the SRD licenses stats and text, never art (owner, 2026-08-01).
- **Sharing:** a character has a public read-only link; a campaign has no anonymous link, only the
  invite.
- **Names:** "D&D" and "Dungeons & Dragons" appear only as descriptive text ("for the 2024 rules of
  the world's greatest roleplaying game" style), never in the name or logo. Add the "unofficial,
  not endorsed by Wizards of the Coast" line. Nothing non-SRD sits behind a future payment.

## Money (owner 2026-10-16)

**Spend nothing now.** The kill-switch stays at zero spend. The app costs £0 at today's usage and
about $2–5 a month at 1,000 users. **Folio should earn rather than cost.**

Revenue routes, roughly in order of fit:

1. **Donations.** Ko-fi or Patreon: no consent banner, nothing in the way of play.
2. **Affiliate links and sponsors.** Dice, books, Italian game shops, placed in the guide and on the
   landing page, never mid-combat.
3. **A small supporter plan.** Around €1.50/month for extras, never for non-SRD content.
4. **Display ads.** Only on non-play pages. Personalised ads need a consent banner under the
   Garante rules, and they earn only about €1–2 per 1,000 views.

Nothing ships until the product is professional and has users.

## Non-goals

- A VTT: maps, tokens, fog, video.
- AI calls inside the app.
- Rolling dice today.
- Hosting other people's non-SRD content.
- A public homebrew marketplace.
- Native app-store apps at launch: PWA first, Google Play via a Trusted Web Activity later.
