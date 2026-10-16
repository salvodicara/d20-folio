# d20 Folio — product brief (2026-10-16)

Owner decisions of 2026-10-16, taken in the strategy session. This brief supersedes the audience,
positioning and business sections of `PRODUCT.md`, `docs/PRODUCT_CONSTITUTION.md` and
`docs/POSITIONING.md`, and VISION's "per noi, non commerciale". `docs/VISION.md` keeps the
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
- **The private `content-pack/`:** only for allowlisted accounts (the owner's groups). It is loaded
  at runtime from protected storage, **never compiled into the public bundle**. Today it is compiled
  in: `tsconfig.app.json` `@pack` aliases resolve to `content-pack/`. That is the first thing to
  fix, because a public bundle carrying non-SRD text is what gets fan apps taken down.
- **Names:** "D&D" and "Dungeons & Dragons" appear only as descriptive text ("for the 2024 rules of
  the world's greatest roleplaying game" style), never in the name or logo. Add the "unofficial,
  not endorsed by Wizards of the Coast" line. Nothing non-SRD sits behind a future payment.

## Non-goals

- A VTT: maps, tokens, fog, video.
- AI calls inside the app.
- Rolling dice today.
- Hosting other people's non-SRD content.
- A public homebrew marketplace.
- Native app-store apps at launch: PWA first, Google Play via a Trusted Web Activity later.
