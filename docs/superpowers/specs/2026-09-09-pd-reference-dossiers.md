# PD — reference dossier drafts, one per surface Astra redesigns

Claude, 2026-09-09, for block PD. These are the `## Reference dossier` entries golden rule 30's
gate requires (`tests/unit/docs-budget.test.ts`; format in [`README.md`](README.md)): for each
surface, the product that already does it, the evidence, what is copied, what is adapted and why.
Astra's specification for each redesigned surface can carry its entry verbatim and add the visual
design under it. Order: creation first, then the rest by the priority of the
[rule 30 audit](../research/2026-09-09-rule-30-audit.md) (`M` before `D` before `P`).

Evidence keys as in the audit: `RC`, `RCH`, `RL`, `RT`, `RGF`, `PRI` are the files under
[`../research/2026-09-09-rule-30/`](../research/2026-09-09-rule-30/); `PD` is
[`../research/2026-09-09-pd-bg3-dndbeyond-research.md`](../research/2026-09-09-pd-bg3-dndbeyond-research.md)
with evidence `E1–E5`; `GF` is [`../research/2026-09-09-game-feel.md`](../research/2026-09-09-game-feel.md);
captures are the committed screenshots under `docs/program/reference/screenshots/` or the URL to open.
Nothing below decides a colour, a layout or a typeface.

## Reference dossier

### D1 — Creation: the door and the step model

- **Surface** — entering creation from the roster; the list of steps; their completion state;
  where the flow can be left and resumed.
- **Product** — D&D Beyond (Standard / Quick Build / Premade entry, blue required-outline, `(!)`
  markers); Baldur's Gate 3 (left step list, "Proceed" lit only when complete, every step
  revisitable); Roll20 Charactermancer (one decision per slide, rulebook passage beside it);
  GOV.UK "Complete multiple tasks" (save and complete later, task list with Incomplete state).
- **Evidence** — PD §3–§5, E1 §1, E3 §1, E4 §6 (URLs there); RGF §7; audit §2.3 rows "Creation
  door", "Step list and order", "Draft persistence".
- **Copied** — one click from the roster into step 1; a step list that shows done / current /
  incomplete from the preview's issues; every step revisitable; the draft survives leaving.
- **Adapted** — the step list splits our `origins` step into species and background (one decision
  family per step); the order itself is Astra's (PD §10); resumption reads `CreationDraft.step`.
- **Why** — the references converge on a stateful step list and a resumable draft; our six
  stateless buttons and a second door card exist in no reference.

### D2 — Creation: choosing species, background and class

- **Surface** — the three source pickers and the reading panel beside them.
- **Product** — Baldur's Gate 3 (class and race panels with flavour beside mechanics, background
  showing its two skills inline, short filtered lists); D&D Beyond Quickbuilder (class and species
  as art tokens, "not walls of text"); D&D Beyond sources step (content scoped by book before the
  choices).
- **Evidence** — PD E1 §1–§3 (patterns 3–4), E3 §1, E3 §3 (portrait vs spells); RL §Dominant 4
  (mine / shared / official as the three sources); audit §2.3 row "Species / background / class
  pickers"; capture: https://bg3.wiki/wiki/Character_creation and
  https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future.
- **Copied** — each option carries its one-line meaning and what it grants (skills, feat, +2/+1,
  senses) at the moment of choice; options grouped by source (SRD, your library, campaign pack);
  the chosen option's full text opens in place, one level deep.
- **Adapted** — descriptions are in-house one-liners in EN and IT (`src/i18n/{en,it}/srd/`), never
  the books' prose; art per class/species is generated in the owner's GPT workflow, never copied
  (DECISIONS 2026-09-09 evening); whether the picker shows art at all is Astra's (PD §10).
- **Why** — the flat native select of 24 + 62 names with no meaning is the thing both references
  replaced; grouping by source is what makes shared and pack content legible.

### D3 — Creation: class choices (skills, fighting style, mastery, spells)

- **Surface** — the choice groups a class emits at level 1.
- **Product** — Baldur's Gate 3 (skills as a class-filtered 2–4 of ~6; spells picked from the
  legal-at-level-1 list inside creation); Slay the Spire (keywords define themselves where shown,
  ≤ 2 levels); NN/g progressive disclosure (≤ 2 levels).
- **Evidence** — PD E1 §1–§2 (patterns 3, 8), E4 §1–§2 (patterns 9, rule 1); audit §2.3 row
  "Class choices"; capture: https://bg3.wiki/wiki/Point_Buy and the spell list at
  https://bg3.wiki/wiki/Spells.
- **Copied** — short filtered pools; the option's meaning beside it; a glossary on the group label.
- **Adapted** — weapon mastery filtered to weapons the class is proficient with and the chosen kit
  (Baldur's Gate 3 has no mastery); the fighting-style group is labelled as such, not "Feat"; the
  JSON "Declaration details" leaves the player path (provenance stays in inspection).
- **Why** — 38 flat weapons and a JSON dump under each style are a third disclosure level and an
  unfiltered pool, both documented failures (NN/g, PD §7 item 8).

### D4 — Creation: abilities

- **Surface** — method, six scores, background increases.
- **Product** — Baldur's Gate 3 ("Recommended" fills the 27-point pool to the class ideal; primary
  ability starred on the allocator; the +2/+1 floating increase); D&D Beyond (Standard Array /
  Point Buy / Manual with help text).
- **Evidence** — PD E1 §1, §3 (patterns 1–2), E3 §1; RGF §7; audit §2.3 row "Abilities step";
  capture: https://bg3.wiki/wiki/Point_Buy.
- **Copied** — one-click Recommended, editable afterwards; primary abilities marked; live totals
  per ability (already present).
- **Adapted** — Recommended replays the legacy preset through the P10 seam
  (`src/lib/character-creation/recommended.ts`); standard array is the default method (owner's
  2024 rules), point buy and manual stay one control away.
- **Why** — the two slowest decisions in the references are removed by one action each; our
  allocator has neither.

### D5 — Creation: equipment and magic

- **Surface** — class kit, background kit or gold, starting spells.
- **Product** — Baldur's Gate 3 (starting spells and gear as concrete items during creation);
  D&D Beyond (package vs gold, "Show Level-Scaled Spells").
- **Evidence** — PD E1 §2, E3 §1–§2; audit §2.3 row "Equipment step".
- **Copied** — kits named by their source; each item readable in place; spells picked from the
  legal list with the prepared/known distinction visible.
- **Adapted** — retained inactive branches (our cascade model) are hidden behind one disclosure
  rather than shown as a choice; browsing spends nothing (P10 contract).
- **Why** — the references never show a "currently grants nothing" group to the player.

### D6 — Creation: the live consequence aside and the review

- **Surface** — the aside that follows every step; the final review.
- **Product** — Fire Emblem combat forecast; Into the Breach telegraphing; Baldur's Gate 3 right
  panel "dynamically updates"; D&D Beyond Character Header (identity, HP, then core numbers,
  every total openable to its breakdown); Roll20 2024 AC dropdown breakdown.
- **Evidence** — PD E4 §2, §4 (pattern 10, rule 5); RGF §3 (rule G3); RCH (a) and Dominant 1;
  audit §2.3 rows "Live consequence aside", "Review step"; capture:
  https://fireemblemwiki.org/wiki/Combat_forecast and
  https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193980820-Character-Header.
- **Copied** — the aside shows the numbers the sheet will show (HP, AC, speed, saves, skills,
  slots) and the delta of the option under focus before it is committed; the review is the sheet
  header the player will meet, each number openable.
- **Adapted** — the forecast is computed by `forecastCreation`/`speculate`
  (`src/lib/views/creation-forecast.ts`); units follow the locale with whole numbers; the full
  source declarations move to the inspection dialog.
- **Why** — "the choices and their consequences" is the owner's PD exit condition; both references
  show the consequence before the click and never a JSON block.

### D7 — Creation: validation and errors

- **Surface** — how a missing or invalid choice is signalled.
- **Product** — UK Parliament design system (the message names the field and the fix); D&D Beyond
  (required control outlined, progression blocked); Baldur's Gate 3 ("Proceed" disabled while
  requirements are unmet).
- **Evidence** — PD E4 §6 (rule 8), E1 §1, E3 §1 (patterns 5–6); audit §2.3 row "Validation and
  errors"; capture: https://designsystem.parliament.uk/how-tos/writing-error-messages/.
- **Copied** — one message per control, on the control, naming the field and the fix; a count on
  the step tab; the primary action disabled while incomplete, the gaps visible.
- **Adapted** — messages come from `creationIssueMessage` and `creationV2.fix.<code>` in EN and
  IT (`src/lib/views/creation-issues.ts`), with the control label interpolated; the attributed
  rule exception stays available on the codes P10 allows.
- **Why** — "mancano i campi" is the owner's own description of the current summary block.

### D8 — Creation: recommended and quick paths

- **Surface** — the fast lane for an expert or an undecided beginner.
- **Product** — D&D Beyond (Quick Build: species, class, name; Premade; Randomize); BG3 (Origins as a zero-decision path, 7 % uptake; Recommended per step).
- **Evidence** — PD E3 §1, E1 §3 (pattern 7), §9.1 (owner question); RGF §7 (rule G7); audit §2.3
  row "Recommended / quick path".
- **Copied** — a recommended build per class, one click, editable; the quick path stays a minority
  path beside the guided one.
- **Adapted** — `applyRecommendedBuild(draft, classId)` yields a valid character from class + name;
  whether the door offers it is the owner's open question (PD §9.1).
- **Why** — the expert minimum today equals the beginner's (29 / 40 interactions, E5 §6).

### D9 — Creation: explain on demand and identity

- **Surface** — glossary on every rubric; the character's name and portrait in the flow.
- **Product** — Slay the Spire (gold keywords, tap/hover definitions); Hades codex (opt-in, never
  auto-opened); D&D Beyond Help Text toggle (on by default, remembered); Baldur's Gate 3 Examine /
  pin tooltip; Pokémon and Zelda (name first, used everywhere).
- **Evidence** — PD E4 §1–§2 (rules 3–4, 9); RGF §2, §7; RL §6 (three disclosure levels: hover,
  expand, pin); audit §2.3 rows "Explain on demand", "Identity moment".
- **Copied** — the glossary primitive on each label (ten creation terms added in EN/IT); no
  task-required information only in a hover; the name in every later heading.
- **Adapted** — the single `GlossaryTip` primitive already exists (`src/components/shared/`); a
  remembered "help text" preference is subject to the owner's 2026-09-07 decision on switches
  (PD §9.5); portrait step and art are Astra's (PD §9.3, §10).
- **Why** — zero glossary uses in the six live creation files today (E5 §3).

### D10 — Landing and the campaign hub

- **Surface** — the first screen after sign-in; the campaign's home.
- **Product** — Roll20 Game Details ("the first page new players see": icon, name, Launch Game,
  Next Game Will Be in local time, roster); D&D Beyond campaign page (character cards, invite link
  under the name, Game Log); Kanka dashboard (header always visible, calendar widget); BG3 (camp as hub, journal as "what's next").
- **Evidence** — RC §Job A and §Dominant A; the mock `campaign-desktop.webp` and
  `01-campaign-1440.webp`; audit §1 finding 1, §2.4 row "Campaign hub"; capture:
  https://help.roll20.net/hc/en-us/articles/29620064514071-Game-Details-Page-GM-Only.
- **Copied** — party, one primary action, invite link and next date without scrolling; the latest
  recap one step away; membership and prep behind a secondary section.
- **Adapted** — the mock's chapter framing and "Riprendi l'avventura" are kept; the default route
  becomes the last campaign hub (else the roster), Account only from the avatar.
- **Why** — landing on the Account profile form is the first "post office" moment; no reference
  does it.

### D11 — Invite and join

- **Surface** — how a DM invites and how a player joins with a character.
- **Product** — D&D Beyond "Join a Campaign" (link, then create / premade / claim / pick a
  character, "JOIN WITH THIS CHARACTER"); Roll20 (Player Join Link rotates on kick, GM link
  single-use); Kanka (invite with role and expiry).
- **Evidence** — RC §Job G and §Dominant G; the mock `#invite` (MW §5.6); audit §2.2 row "Invite
  / join", §2.4 row "Invite link".
- **Copied** — a link that carries the role, lands on a character-choice step, rotates on removal;
  "create a character now" as a branch of joining.
- **Adapted** — an opaque token replaces the raw campaign document id; the mock's "Rivendica PG del
  DM" (claim a DM-prepared character) is kept as the premade branch.
- **Why** — the current "Campaign code" is a storage id; every reference hides it.

### D12 — Roster and its empty state

- **Surface** — "My characters".
- **Product** — D&D Beyond My Characters (search, sort, View / Edit / Copy / Delete / Leave
  Campaign, slot count); NN/g empty states.
- **Evidence** — RCH (e) and Dominant 5; RGF §4; audit §2.3 rows "Roster", "Roster empty state".
- **Copied** — per-card Copy and Leave campaign; filters and search; an empty state with a learning
  cue and a pathway.
- **Adapted** — the legacy strings "Your folio awaits" / "Forge your first adventurer…" already in
  the catalogue are reused.
- **Why** — the current empty state is status-only ("No characters here").

### D13 — Library: create content and the editor register

- **Surface** — the family picker, the basic form, the "set up" fields of the eleven editors.
- **Product** — D&D Beyond homebrew ("Use an existing spell" vs "Create From Scratch", then Basic
  Information → Create → mechanics; imperative verbs); Foundry (Import / Duplicate then edit; Item
  sheet tabs Description / Details / Activities / Effects; Advancement per level); 5etools ("Load
  Existing Creature" as base).
- **Evidence** — RL §1b, §2b, §4b and §Dominant 2; the mock `#homebrew` (MW §3.2); audit §2.5 rows
  "Create content", "Editor register", "Class / subclass editors"; capture:
  https://www.dndbeyond.com/posts/1169-how-to-create-a-homebrew-spell-using-d-d-beyond.
- **Copied** — "start from an existing entry" as the first choice; two-stage basic → mechanics
  (already ours); groups named by what they do at the table; no structure shown to the author.
- **Adapted** — our typed vocabulary stays (P05–P08c); "declaration" wording is replaced by the
  player's words with one sentence saying fields describe and do not execute.
- **Why** — the structure follows D&D Beyond and Foundry; only the register and the missing
  "start from" reinvent.

### D14 — Library: sharing and copies

- **Surface** — offers, copies, revocation, "shared with me".
- **Product** — D&D Beyond Collection (membership-based, automatic, "Remove From Collection";
  documented failure: hidden preconditions); Foundry ownership (None / Limited / Observer / Owner,
  owned copies independent of the original); Roll20 "Share my compendium with players?".
- **Evidence** — RL §1c–§1d, §2c–§2d, §Dominant 3–4 and failures; the mock `#library-sharing`
  (MW §3.3); audit §2.5 row "Sharing & copies".
- **Copied** — a member sees campaign-shared content within one refresh; per-item revoke per group;
  every row shows its source; a Mine / Shared / Official filter.
- **Adapted** — offer / accept stays for personal copies (our provenance-and-receipt model);
  display names replace uids.
- **Why** — the three hidden switches behind D&D Beyond's "my players cannot see it" are the
  failure to avoid; automatic visibility for the campaign is the dominant pattern.

### D15 — Import and inspection

- **Surface** — importing a character file; the read-only inspection dialog.
- **Product** — Foundry (Export Data / Import Data JSON, overwrite after explicit confirm);
  Pathbuilder (Export JSON, Backup / Restore); D&D Beyond (DM live access to any sheet).
- **Evidence** — RCH (g) and Dominant 7; RC §Job A; audit §2.3 rows "Import flow", "Inspection
  dialog".
- **Copied** — JSON in/out with a named reason for rejection; dry-run preview; confirm before write;
  DM inspection without impersonation.
- **Adapted** — our 2014 → 2024 review keeps the edition distinct from the file format (P10); the
  category names and the raw values move behind one "Show the raw values" disclosure.
- **Why** — the structure already follows; the register ("format 3", "projected value") does not.

### D16 — Account: profile, preferences, privacy

- **Surface** — the seven Account sections.
- **Product** — D&D Beyond / Foundry setting rows (title + control + one sentence); Foundry Dice
  Configuration (per-die manual input); Kanka permissions guide (visibility in the member's words).
- **Evidence** — PRI §2; RT (e); RC §Job D; the mock `#account` and r2 preferences screenshot;
  audit §2.2.
- **Copied** — one sentence per setting; the dice preference as it is; privacy explained in the
  second person.
- **Adapted** — the profile helper text is corrected (it describes a character field today);
  placeholders name the delivering block and the one action available now.
- **Why** — the structure follows shell r2; three strings contradict their controls.

### D17 — Cross-cutting: copy register, empty states, feedback, motion

- **Surface** — every string, every empty container, every commit.
- **Product** — Shopify Polaris, Mailchimp, GOV.UK (the baseline); Baldur's Gate 3 tooltips,
  Hades, Darkest Dungeon, Elden Ring templates (the game register); NN/g empty states and feedback
  by urgency; Material 3 / WinUI / Apple HIG / WCAG 2.3.3 (budgets); Dice So Nice, Owlbear dice,
  D&D Beyond shared dice (settle and skip).
- **Evidence** — GF §2.4–§2.7 with the sixteen before/after rows; RGF §4–§8; audit §2.8.
- **Copied** — the four register checks; status + cue + reason in empty states; settle after
  trigger; the four motion budgets; one skip per ritual.
- **Adapted** — Italian keeps verb-first shapes and avoids administrative defaults; a speed
  preference is distinguished from the forbidden "disable animations" switch (owner 2026-09-07).
- **Why** — the owner's complaint is register and feedback, not structure; the mock already has
  both and the runtime has neither.

### D18 — At the table: dice visibility, reactions, rest (for P14–P15, to carry forward)

- **Surface** — roll visibility, reaction prompts, rest dialog.
- **Product** — Foundry roll modes (public / GM / blind / self, reveal after the fact); Roll20
  `/gmroll` with 3D dice suppressed for secret rolls; D&D Beyond Everyone / Self / DM; BG3 reactions Always / Never / Ask; dnd5e rest dialogs (Auto Spend HD, no question phrasing);
  Baldur's Gate 3 partial rest.
- **Evidence** — RT §Dominant (c), (e), (f); PD E2 patterns 5–6; RGF §9 (rule G8); the mock
  `#combat` and `#character` rest (MW §4.1, §2.1).
- **Copied** — four visibility modes with the DM's remembered default; three-state reactions; rest
  shows cost and degradation up front, HP unchanged until confirmed, hit dice automated.
- **Adapted** — the mock's physical-dice entry writes to the same log with a source tag (golden
  rule 32); the DM's hidden roll is a mode, not a purchase.
- **Why** — D&D Beyond shipped its log without hidden rolls and patched it two years later; the
  mock already has the receipt model these need.
