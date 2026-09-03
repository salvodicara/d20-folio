# Position, movement, range and reactions without a map — research for d20 Folio

Date: 2026-09-03. Scope: how map-less products and TotM-first game systems represent position,
and what a D&D 2024 companion app (no map, no grid, no RNG) can automate from declared facts.
Method: WebSearch + WebFetch of primary sources (rules text, product docs, developer posts,
community threads); each claim carries a source id from §7. Reddit is not crawlable by this
harness; community evidence comes from EN World, D&D Beyond forums, RPG Pub, Larian/Steam forums
and blogs that quote Reddit practice. The repo's own combat spec (D2 relations, §2.3 of
`docs/superpowers/specs/2026-09-02-total-combat-automation-design.md`) is treated as the incumbent
proposal and evaluated, not assumed.

Terminology used below: **relation** = a declared fact between two entities; **band** = an
ordinal distance class; **spot** = a named place tag with no geometry; **window** = a reaction
opportunity opened by the reducer (spec §5).

---

## 1. Position models compared against D&D 2024's distance-dependent rules

The rules that actually read a distance in D&D 2024 (SRD 5.2.1 / Free Rules; text per [S12]):

| #   | Rule                                                                                                                        | What it needs                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Reach: "a creature has a 5-foot reach" (10 ft with reach weapons / Large+)                                                  | a binary "within reach" fact per pair                                                                                                         |
| R2  | Opportunity Attack: "when a creature that you can see leaves your reach"                                                    | a _transition_ of R1 from true to false, plus visibility, plus "not Disengage / not teleport / not forced"                                    |
| R3  | Disengage: "your movement doesn't provoke Opportunity Attacks for the rest of the current turn"                             | a per-turn standing                                                                                                                           |
| R4  | Dash: extra movement equal to Speed                                                                                         | a movement budget (only matters if movement is modeled)                                                                                       |
| R5  | Difficult Terrain: "every foot … costs 1 extra foot"                                                                        | movement budget + terrain flag                                                                                                                |
| R6  | Ranged normal/long: "Disadvantage when your target is beyond normal range, and you can't attack a target beyond long range" | an ordinal distance class per pair                                                                                                            |
| R7  | Ranged in melee: "Disadvantage … if you are within 5 feet of an enemy who can see you"                                      | R1 against any hostile + visibility                                                                                                           |
| R8  | Cover: half +2 / three-quarters +5 / total untargetable                                                                     | a per-attack modifier from target's surroundings                                                                                              |
| R9  | Spell range (Touch / 30 / 60 / 120 / Self) and Counterspell "within 60 feet"                                                | ordinal class per pair. SRD histogram in this repo: Touch 66, 60 ft 65, Self 53, 30 ft 47, 120 ft 34, 90 ft 12, 150 ft 12, 10 ft 11, 300 ft 6 |
| R10 | Areas of effect and emanations/auras ("within 10 ft of you", Spirit Guardians "enters the area")                            | set membership, entry/exit events                                                                                                             |
| R11 | Sneak Attack: "an enemy of the target is within 5 feet of it"                                                               | R1 between ally and target                                                                                                                    |
| R12 | Protection / Interception fighting styles, Shield Master etc.: "ally within 5 feet"                                         | R1 between allies                                                                                                                             |
| R13 | Ready: "a perceivable circumstance" trigger                                                                                 | an event the app can observe, or free text                                                                                                    |
| R14 | Moving through spaces, squeezing, prone stand-up cost, jumping, climbing                                                    | geometry; no companion app models these                                                                                                       |

Position models found in the wild, and which rows each can automate:

| Model                                                     | Who uses it                                                                                                                                                                                                                                                                                                             | Represents                                                                                                                                         | Automates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Cannot automate (stays with the table)                                                                                                                                                                                                                                                                            | Declaration cost                                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grid / measured map**                                   | Foundry + Midi-QOL/Gambit's Premades [S24][S25], Familiar VTT [S26], D&D Beyond Maps [S17][S18], Solasta, BG3 [S27][S28], Draw Steel by design [S31]                                                                                                                                                                    | x,y per token, walls, elevation                                                                                                                    | R1–R14 (Familiar: "step out of a monster's reach and its opportunity attack rolls itself … Disengage or teleport, and it correctly holds" [S26])                                                                                                                                                                                                                                                                                                                                                                                           | nothing rules-wise; it _replaces_ the table. Out of scope for this app by constitution (spec §1 "No VTT")                                                                                                                                                                                                         | every move is a drag; the map must exist and be kept honest for the whole fight                                                                                 |
| **Zones**                                                 | Fate Core / System Toolkit [S6], Sly Flourish "Zone-based combat in D&D" [S13], Runehammer 5e Hardcore Mode [S10], EN World zone thread [S15], DDB "Theater of the Mind Organizer" pins [S19][S20]                                                                                                                      | named areas (~30 ft; "one zone = 5 squares" per Evil Hat's grid hack [S6b]) with an adjacency graph; entities belong to a zone                     | R4/R5 as "one zone per move, Dash two, difficult zone costs the whole move" [S10][S13]; R6/R9 coarsely ("same or adjacent zone" [S13]; Hardcore Mode: "all ZONES in an encounter are within range" [S10]); R10 approximately (AoE = everyone in the zone, Sly Flourish target counts 2/3/4/8+ [S13]); cover/terrain as zone tags [S15]                                                                                                                                                                                                     | R1/R2/R7/R11/R12: a zone is 30 ft wide, so "within 5 ft" is _not_ derivable — Sly Flourish's zone rules bolt on "threatened only if attacked in melee" [S13] and Hardcore Mode simply deletes opportunity attacks [S10]; EN World replies list OA, reach and push-10-ft combos as the mechanics zones break [S15] | low per move, but the DM must draw the zone graph up front; players and DM must agree on adjacency                                                              |
| **Range bands (from the actor)**                          | Daggerheart Melee/Very Close/Close/Far/Very Far [S1][S2][S3]; 13th Age engaged/nearby/far away [S5][S7]; ICRPG CLOSE/NEAR/FAR [S9]; Shadowdark close 5 / near 30 / far sight [S11]; Dungeon World hand/close/reach/near/far tags [S8]; Oracle RPG's 5e TotM rules [S22]; EN World "Engaged / Within 30 / 60 / 90" [S16] | an ordinal class per pair, measured from the source ("range is measured from the source of an effect … to the target" [S1]); melee is its own band | R1/R2/R3/R7/R11/R12 when the lowest band means "within reach" (13th Age: leaving _engaged_ is the only thing that provokes [S5]; Oracle: "attacks of opportunity trigger when a combatant at Close range attempts to move to Medium or Long" [S22]); R6/R9 exactly enough if band ceilings sit on 30/60/120 ft; R4 as "one band per move, Dash two" (Daggerheart: Very Close/Close → Melee as part of the action, Far/Very Far needs a roll [S1]; ICRPG: "move NEAR … or move FAR" [S9]); R10 for emanations (the aura owner's reach band) | R8 cover, R10 for placed AoEs, R5 extents, R14. Pairwise bands are O(n²) unless a default band carries most pairs                                                                                                                                                                                                 | one chip per changed pair; defaults ("everyone is nearby" [S5], "roughly within 25 feet unless we state otherwise" [S14b]) carry the rest                       |
| **Pure relations (engaged / adjacent / cover / visible)** | Sly Flourish narrative guide ("assume characters within five feet risk opportunity attacks if moving elsewhere" [S14]); EN World and DDB forum DMs' "Engaged" keyword [S16][S23]; the repo spec §2.3 (`adjacent`, `engaged`, `cover`, `visible`, `aura-member`)                                                         | a graph of declared binary facts; no distance class beyond "adjacent or not"                                                                       | R1/R2/R3/R7/R8/R11/R12 and R10 via `aura-member` — everything the spec already derives                                                                                                                                                                                                                                                                                                                                                                                                                                                     | R6/R9 and R4/R5 with no band; Counterspell's 60 ft and long-range disadvantage become "always eligible"                                                                                                                                                                                                           | lowest of all; but ranged range gating is lost unless a band relation is added (the spec adds `range: reach/near/far/out`, which is the band model in disguise) |
| **No position at all**                                    | Shieldmaiden [S32], Improved Initiative [S33], Kobold+ Fight Club [S34], D&D Beyond Encounter Builder outside Maps [S17][S21], Avrae (`!i aoo`, `!i rc` exist, "no representation of spatial positioning" [S35]), Alchemy's TotM mode (portraits, no tokens [S36])                                                      | nothing; initiative, HP, conditions, multi-target picks                                                                                            | none of R1–R14; reactions are logged after the table decides them                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | all of it                                                                                                                                                                                                                                                                                                         | zero — which is why it dominates today                                                                                                                          |

Reading the table: **rows R1/R2/R7/R11/R12 collapse onto one binary fact (within reach), rows
R6/R9 onto one ordinal fact with ceilings at 30/60/120 ft, R8 onto a per-target modifier, R10
onto set membership.** Nothing else in the 2024 rules reads distance. A model that carries those
four facts covers every distance-sensitive rule except movement budgets (R4/R5) and geometry
(R14), and those two are the ones every TotM guide tells the DM to hand-wave anyway.

---

## 2. The dominant pattern for map-less companion apps, and why

**Pattern: do not model position; track initiative, HP, conditions and targets; leave geometry
and reactions to the table.** Every shipping D&D companion outside a VTT does this:
Shieldmaiden's tracker page lists HP, conditions, concentration reminders, multi-target "select
everyone within the area of a fireball" but no positioning or reaction management [S32]; Improved
Initiative advertises initiative, HP and stat blocks [S33]; Kobold+ Fight Club adds an initiative
list next to each name and exports to Improved Initiative [S34]; D&D Beyond's Encounter Builder
is "very old, archaic, and fragile" and its combat tracking lives inside Maps [S21][S18]; Avrae
tracks targets with `-t` and offers `!i aoo` / `!i rc` commands to _record_ an opportunity attack
or reaction the table already adjudicated [S35]. The one purpose-built TotM tracker found
(Puzzlebottom TOTM) represents location only as **clusters** — "Inside", "On the Roof" — that
agents toggle membership in, i.e. spots without geometry [S37].

Where products _do_ go further than the pattern, they go in one direction — **tags and bands,
never coordinates**:

- D&D Beyond shipped a free "Theater of the Mind Organizer" map in Basic Maps (Scene Prep,
  2026-08) that is a blank surface for scene pins and notes, explicitly for TotM and in-person
  tables; it tracks no positions [S19][S20]. Its 2026 mid-year roadmap commits to "lift the DM
  tools we've been building inside of Maps to be accessible even if you aren't using the VTT" plus
  an Encounter Builder refresh [S17]; in the Feb-2026 AMA the product lead said they are
  "exploring … what a 'theater of the mind mode' would look like" and "not everyone wants to use a
  full-on VTT" [S21]. Nothing has shipped for positions.
- Demiplane's Daggerheart Nexus sheet shows each active weapon's **range band as a label**
  (trait, range, damage die, type, burden) [S2]; it does not track who is at which band — the
  band is a property of the attack that the table checks. Foundry's Daggerheart module draws
  rings at 5/15/30/60 ft [S3] and Foundryborne "supports distance ranges, from Melee, Very Close,
  Close, Far and Very Far" [S4] — i.e. even VTT ports treat bands, not feet, as the unit.
- Text play converged on the same abstraction independently: a Discord DM lists combatants in
  one column, same line = "within 5 to 10 feet", each `---` separator ≈ "15 to 30 feet; generally
  the distance a character can move on a turn" [S38]; EN World DMs add the keyword "Engaged" next
  to a name to mark who provokes [S16]; a DDB forum DM uses "near / mid / far" [S23].
- Systems designed for TotM (13th Age [S5], Daggerheart [S1], ICRPG [S9], Shadowdark [S11]) all
  chose 3–5 named bands from the actor, with **melee/engaged as a distinct band that carries the
  only rules consequence (opportunity attack / disengage roll)**. 13th Age's default is "all the
  heroes and their enemies in a battle are nearby" and "far away" only "if players declare it
  clearly" [S5]; Sly Flourish's 5e guidelines default to "any creature can generally move within 5
  feet of any other creature, and every creature is within range" with the DM stating exceptions
  [S14].

Why this is the equilibrium:

1. **Cost asymmetry.** A map must be honest for every move by every combatant; a declaration is
   only needed when a rule will read it. DDB forum DMs list "position tracking … without minis as
   visual anchors" and "descriptive burden" as the main pains of TotM [S23]; Twilight Dreams
   reports cognitive overload "when players face more than twice their number in enemies" [S39].
   Tools that add per-move bookkeeping die in TotM tables.
2. **Rule shape.** Per §1, the distance-sensitive rules reduce to reach (binary), one ordinal
   band, cover, and set membership. Defaults ("everyone nearby, no cover") are correct most of the
   time, so the model only needs exceptions to be declared (13th Age, Sly Flourish, Shadowdark).
3. **Reaction UX is solved elsewhere and is geometry-free once the trigger fact exists.** Solasta
   (dev diary 2019-07) prompts the reacting player with a sand-glass countdown, "once the sandglass
   is empty, the reaction is cancelled", and only prompts Shield when "the resulting AC would be
   enough to avoid the attack" [S29][S30]. BG3 gives each reaction two checkboxes — enabled, and
   **Ask** ("decide for themselves when to execute the reaction") [S27]; the community-documented
   rule is "if the attack roll beats your AC by less than 5, then you get the reaction" (the mod
   fixes Larian's inverted check) [S28]. Foundry's Gambit's Premades shows reaction dialogs "to both
   the GM and Player" with an "animated countdown timer" and an "AFK player? No problem" GM
   fallback [S24]. Larian's early-access forum shows players asking precisely for "a prompter asking
   if you want to take a reaction" with an automatic/manual toggle [S40]. All of these consume a
   _fact_ ("X left Y's reach", "attack roll r vs AC", "spell cast by Z within 60 ft") — the app can
   produce those facts from declarations instead of coordinates.

---

## 3. Recommended position model: engagement + bands + spots (the spec's D2 relations, sharpened)

Keep the constitutional line — "the app owns declared relational facts and every derivable
consequence; it never owns position, map, measure or line of sight" — and give it exactly the
four facts §1 needs.

### 3.1 Facts

```ts
// Sticky binary fact. Symmetric. "Within reach of each other."
{
  kind: "engaged";
  a: EntityId;
  b: EntityId;
} // hostile pairs: provokes on leaving
{
  kind: "adjacent";
  a: EntityId;
  b: EntityId;
} // friendly pairs: Sneak Attack ally, Protection, Interception

// Ordinal band, measured from a to b (symmetric unless overridden). Default = "near".
{
  kind: "band";
  a: EntityId;
  b: EntityId;
  band: "reach" | "near" | "medium" | "far" | "distant";
}
//  reach   ≤ 5/10 ft   implied by engaged/adjacent
//  near    ≤ 30 ft     one move; 47 SRD spells; javelin/dagger/hand-crossbow normal range
//  medium  ≤ 60 ft     65 SRD spells, Counterspell, most attack cantrips; Dash from near
//  far     ≤ 120 ft    34 SRD spells; longbow/light-crossbow normal range; two Dashes
//  distant > 120 ft    long range only or untargetable

// Per-target modifier, from one attacker or all. Default = none.
{
  kind: "cover";
  target: EntityId;
  from: EntityId | "all";
  degree: "half" | "three-quarters" | "total";
}

// Visibility; default true. Hidden/invisible/blinded/heavily-obscured set it.
{
  kind: "visible";
  a: EntityId;
  b: EntityId;
  value: boolean;
}

// Set membership for emanations and placed areas. Declared once per member.
{
  kind: "aura-member";
  effect: EffectId;
  member: EntityId;
}

// Optional narrative tag, no geometry. DM-created. Carries defaults only.
{
  kind: "spot";
  entity: EntityId;
  spot: SpotId;
}
// Spot { id; label; tags: ("difficult" | "half-cover" | "three-quarters-cover" | "elevated" | "obscured")[] }
// Same spot ⇒ default band "near" and the spot's cover/obscured tags become the entity's default cover/visible.
```

Difference from spec §2.3: the `range` relation gains a **`medium` (≤60 ft)** band and is
renamed `band`; the SRD histogram shows 60 ft is the single most common spell range (65 spells)
and Counterspell's, so a four-band ladder (`reach/near/far/out`) either over-includes every
caster in Counterspell windows or under-includes 120-ft spells. `spot` is new and optional; it
replaces nothing, it only seeds defaults and gives the DM a TOTM-cluster / DDB-organizer-pin
surface [S37][S19].

Defaults, in order of precedence: explicit pair declaration → spot-derived → global default
(`near`, no cover, visible). This is Sly Flourish's "assume everyone is within reach of everyone
unless the DM says otherwise" [S14] and 13th Age's "everyone is nearby" [S5] made executable.

### 3.2 Declarations — who says what, when, and for how long

Never per attack. A declaration is made on the turn that changes it and is retained until a
later declaration, a rule (Disengage, teleport, forced movement, incapacitation, death) or the
DM changes it. Attacks _read_ relations; they ask nothing unless the relation is absent **and**
the default would be wrong in a way that costs a resource (which, with the defaults above, never
happens: `near` and no cover are the permissive assumptions the TotM guides recommend).

Player, on their own turn (mobile, one tap each):

| Declaration                                                                            | Effect on facts                                                                                 | Rules it feeds                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engage X** (implicit in any melee attack or Grapple/Shove on X; explicit button too) | `engaged(me,X)`; `band(me,X)=reach`                                                             | R1, R2 (X now provokes if it leaves), R7 (my ranged attacks have disadvantage while a hostile engaged with me can see me), R11 for allies engaged with X |
| **Break away from X** (part of movement; or "Break away from all")                     | removes `engaged(me,X)`; band steps to `near`                                                   | R2: opens an opportunity-attack window for X and every other hostile engaged with me, unless Disengage standing, teleport, or `forced` flag              |
| **Disengage** (action)                                                                 | per-turn standing `no-provoke`                                                                  | R3                                                                                                                                                       |
| **Move toward X / toward spot**                                                        | band(me,X) steps one class closer (Dash: two); entering `reach` requires Engage (or DM sets it) | R4, R6/R9 next turn; aura entry if X owns an emanation (`aura-member` added with a prompt "enter the area?")                                             |
| **Move away from X / to spot**                                                         | band steps one class farther (Dash two); if `engaged(me,X)` this is Break away                  | R2, R4                                                                                                                                                   |
| **Dash**                                                                               | doubles band steps this turn; difficult-terrain spot halves them                                | R4, R5                                                                                                                                                   |
| **Cover from X / from all: half, ¾, total**                                            | `cover(me, from, degree)` sticky until I move or DM clears                                      | R8                                                                                                                                                       |
| **Hide / I'm unseen by X** (after a Stealth outcome the table enters)                  | `visible(X,me)=false`                                                                           | R7, unseen-attacker advantage, OA "that you can see"                                                                                                     |
| **Next to Y** (ally)                                                                   | `adjacent(me,Y)`                                                                                | R11, R12                                                                                                                                                 |

DM, for monsters and for the fight as a whole (desktop, drag or chip):

| Declaration                                                                                                                   | Effect                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Same set as above, for any creature, plus per-pair overrides ("the archers are `far` from the fighters but `near` the rogue") | as above                                                                             |
| **Everyone near / reset**                                                                                                     | clears all bands to default; keeps engaged pairs                                     |
| **Create spot** with tags; **put A, B, C on spot**                                                                            | seeds defaults; a spot can be an emanation/AoE area ("in the Spirit Guardians area") |
| **Forced movement** (push/pull/teleport) on X, "out of reach: yes/no"                                                         | breaks `engaged` without opening an OA window (R2 exception, [S12])                  |
| **Resolve for AFK player** on an open window (after timeout)                                                                  | copies Gambit's Premades' GM fallback [S24]                                          |

What is never asked: "how far exactly", "who else is within 5 ft", "is there line of sight"
(visible defaults true), AoE membership as a distance question (the DM multi-selects targets,
Shieldmaiden-style [S32], with Sly Flourish's 2/3/4/8+ counts shown as a hint [S13][S14b]).

### 3.3 Reactions the facts can open automatically (spec §5 windows)

| Reaction                                                              | Trigger fact                                                                                                                                                                 | Eligible set (derived, no geometry)                                                        | Prompt policy                                                                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opportunity Attack (core; Sentinel/Polearm riders as programs)        | `entity-left-reach(a,b)` emitted when `engaged(a,b)` is removed by a move/Break-away, not by Disengage standing, teleport or forced movement                                 | every b with reaction available, `visible(b,a)`, not Incapacitated                         | Ask by default (BG3 "Ask" [S27]); the die is entered by the reacting player; auto-skip on timeout                                                        |
| Ranged-in-melee disadvantage                                          | any `engaged(me,H)` with H hostile and `visible(H,me)`                                                                                                                       | modifier, no window                                                                        | automatic (spec "Automatic" mode)                                                                                                                        |
| Shield                                                                | `attack-declared(target=me, roll=r)` with r known                                                                                                                            | me, if AC ≤ r < AC+5 and slot available (Solasta rule [S29][S30]; BG3 intended rule [S28]) | Ask only when it would matter; also open on Magic Missile                                                                                                |
| Counterspell                                                          | `spell-cast(caster=Z)`                                                                                                                                                       | every entity with reaction + Counterspell, `visible(e,Z)`, `band(e,Z) ≤ medium`            | Ask; default band `near` makes every caster eligible unless declared farther — correct per Sly Flourish's "every creature is within range" default [S14] |
| Readied action                                                        | the readied trigger is authored as an event subscription (`X moves`, `X attacks`, `anyone enters spot S`, `Z casts`) at Ready time; free-text triggers become `manual-table` | the readier                                                                                | Ask; slot for a readied spell is released at start of next turn if unused                                                                                |
| Uncanny Dodge, Hellish Rebuke, Cutting Words, Protection/Interception | `attack-declared`/`damage-taken` on self or on an `adjacent` ally                                                                                                            | self / adjacent allies                                                                     | Ask                                                                                                                                                      |
| Emanation entry (Spirit Guardians, Sanctuary-like)                    | `band(m, owner)` becomes `reach` or `spot` = area                                                                                                                            | mover                                                                                      | Ask the mover "enter the area?" once; then `aura-member`                                                                                                 |
| Legendary Action after another creature's turn                        | `turn-end(other)`                                                                                                                                                            | the legendary creature                                                                     | Ask DM                                                                                                                                                   |

Timing pattern (all four reference products agree): open the window on the reacting device
only; show the triggering fact and the resource cost; countdown (Solasta [S29]); GM/DM sees the
same window in a tray and can resolve for an AFK player (Gambit's Premades [S24]); per-reaction
Always / Ask / Never preference persists on the character (BG3 [S27]). The app never rolls: the
window collects the die from the player.

---

## 4. UI proposal (elements and the product each copies)

### Mobile — player combat screen

1. **Relation strip** under the initiative bar: one chip per visible hostile, colored by band
   (`Engaged` is a distinct filled chip). Copies Daggerheart Nexus's range labels on weapon rows
   [S2] and 13th Age's `Engaged` state [S5]; the "Engaged" keyword is what EN World DMs already
   write by hand [S16].
2. **Tap a chip → bottom sheet** with five large actions: _Engage · Move closer · Move away ·
   Break away · Cover ▾_. Band ladder drawn as five stacked rings labelled reach / near / medium /
   far / distant with the current ring highlighted (Foundry "Daggerheart: Distances" rings [S3],
   flattened to a ladder). Dash toggle doubles the step count and shows "2 steps".
3. **Attack row range hint**: each weapon/spell row shows its band ceiling as a chip
   ("60 ft · medium") and greys out targets beyond it, with "beyond normal range → disadvantage"
   explained on tap (explain-on-demand). Copies Demiplane's per-weapon range label [S2].
4. **Reaction sheet**: full-screen bottom sheet on the reacting player's phone only, headline is
   the fact ("Goblin 2 breaks away from you"), body is the choice (Opportunity Attack / Skip),
   die input, and a countdown ring; footer toggle "Always / Ask / Never for this reaction". Copies
   Solasta's sand-glass prompt [S29] and BG3's enable+Ask checkboxes [S27].
5. **Turn summary line** after each declaration ("You are engaged with Goblin 2 · near the
   archers · half cover from the archers") so state is never hidden; copies the one-line "who is
   where" habit of Discord text combat [S38].

### Desktop — DM encounter surface

1. **Engagement board** beside initiative: rows = combatants; engaged pairs drawn as chips on
   both rows; drag a monster chip onto a PC row to engage; drag off to break away (opens the OA
   window). Copies Shieldmaiden's multi-target selection [S32] and TOTM's cluster icons on the
   active-agent panel [S37].
2. **Spot lanes**: collapsible groups ("front line", "the balcony", "in the pit") with tag pills
   (difficult · ½ cover · elevated); drop combatants in; same-spot pairs default to `near`. Copies
   TOTM clusters [S37], DDB's Theater of the Mind Organizer pins [S19][S20], Sly Flourish's 3×5
   zone cards [S13].
3. **Band matrix** (advanced, collapsed): PCs × monsters grid of band pills for overrides; a
   single "Everyone near" reset. The default-plus-override rhythm is 13th Age's [S5].
4. **Windows tray**: open reaction windows with timers, who is eligible, "Resolve for player"
   after timeout. Copies Gambit's Premades' GM-side reaction dialog and AFK handling [S24].
5. **Encounter log** (append-only, spec §3): every declaration is a log line ("Rogue: break away
   from Goblin 2 → OA window opened for Goblin 2"), so disputes replay rather than argue — the
   DDB forum's "dishonest players exploit narrative uncertainty" pain [S23].

Both surfaces obey the existing seams: declarations are `declare` actions on the reducer; the
UI never computes a rule.

---

## 5. What stays table-adjudicated (honest residuals)

- **Exact distance and line of sight.** Bands are ordinal; "is the 35-ft target in 30-ft range"
  is the DM's call, made once, as a band declaration. Total cover and visibility are declared,
  never inferred.
- **AoE membership for placed areas** (fireball, lines, cones). The DM multi-selects; the app
  shows the DMG/Sly Flourish target-count guidance as a hint [S14][S13]. Emanations are the
  exception (membership follows `reach` to the owner).
- **Movement budget edge cases**: difficult-terrain extent, climbing/swimming/flying speeds,
  jumping, squeezing, moving through occupied spaces, prone stand-up, mounted movement. The app
  models "one band step per move, two on Dash, half in a difficult spot" and nothing finer; EN
  World's zone thread is right that "push 10 ft then Green-Flame Blade" combos [S15] and 10-ft vs
  5-ft reach (Polearm Master's enter-reach OA) only work as declarations ("X enters my reach").
- **Who is "nearest" / monster targeting** and formation effects; Twilight Dreams' formation
  house rules [S39] and Optional Rule's Engage/Avoid/Intercept manoeuvres with opposed checks
  [S41] are house rules, not SRD, and remain manual (the app can log a DM ruling).
- **Flanking** (optional DMG rule, not SRD) — not modeled.
- **Readied actions with prose triggers** ("when the door opens") — `manual-table`; only
  event-shaped triggers open windows.
- **Forced movement consequences** (does the shove leave reach? into the pit? off the ledge) —
  the DM answers one yes/no; the app applies no OA on forced movement, per the rule [S12].
- **The die itself** — by constitution, always table input.

The trade is explicit: the app automates every rule that reads _one_ of the four facts, and it
asks for a fact only when a rule is about to read it and no default or earlier declaration
answers it. Everything requiring a second coordinate stays at the table, which is where every
TotM guide from 2015 to 2026 already puts it.

---

## 6. Evidence by requested area (short)

1. **Range-band systems.** Daggerheart six bands with feet ranges and "measured from the source"
   [S1]; Nexus sheet shows band per weapon [S2]; Foundry rings 5/15/30/60 ft, edge-to-edge,
   percent-in-ring [S3]; Foundryborne supports bands [S4]. 13th Age engaged/nearby/far away,
   disengage save 11+, intercept, ranged-while-engaged provokes, "no engagement limit" [S5][S7].
   Fate zones "roughly … the area where two people can touch", 1 zone/exchange free [S6], 1 zone =
   5 squares [S6b]. Dungeon World hand/close/reach/near/far verbatim [S8]. ICRPG CLOSE/NEAR/FAR and
   "move NEAR, take action, … or move FAR" [S9]. Runehammer 5e Hardcore Mode: 30×30 zones, "all
   ZONES … within range", opportunity attacks removed [S10]. Shadowdark close 5 / near 30 / far
   sight [S11]. Savage Worlds: community runs it TotM or with abstract Roll20 boxes; no official
   abstract ranges found [S42]. D&D 2024 rules text for reach, OA, Disengage, difficult terrain,
   ranged ranges, ranged-in-melee, cover, moving through spaces [S12].
2. **Trackers and DM tools.** Shieldmaiden [S32], Improved Initiative [S33], Kobold+ [S34], DDB
   Encounter Builder/Maps/roadmap/AMA [S17][S18][S21], DDB TotM Organizer + Scene Prep 2026-08
   [S19][S20], Alchemy TotM portraits + optional grid "tactical mode" [S36], Foundry TotM module and
   hidden combat tracker [S43], Owlbear initiative-tracker extension (no TotM/zone extension exists;
   "Theatre!" is a dialogue tool) [S44], Avrae [S35], Familiar VTT auto-OA from token distance
   [S26], Draw Steel requires a grid [S31].
3. **Zone boards / engagement lists.** Sly Flourish zones on 3×5 cards, threatened only if attacked
   in melee [S13]; EN World zones thread and objections [S15]; RPG Pub zone-tools thread was
   paywalled (HTTP 402) and is not cited; "Engaged" keyword and "Engaged / 30 / 60 / 90" buckets
   [S16]; DDB forum "near / mid / far" and paper/Shmeppy sketches [S23]; Discord line-and-dashes
   notation [S38]; TOTM location clusters [S37].
4. **Reactions without a map.** Solasta countdown and prompt-only-when-it-matters [S29][S30];
   BG3 enable/Ask and the <5-over-AC rule [S27][S28]; Larian forum request for Solasta-style
   prompts [S40]; Gambit's Premades GM+player dialogs, countdown, AFK fallback, Counterspell/OA/
   Silvery Barbs/Cutting Words/Protection automated [S24]; Midi-QOL v14.0.11 as the framework
   [S25]; Roll20's 2024 sheet groups reactions but its Nov-2025 automations cover attacks/saves,
   not reaction prompts, and Shield lands under Effects not Reactions [S45][S46]; DDB users ask
   for a reaction tracker because "players … forget they have used a reaction" [S47]; readied
   spells vs Counterspell timing [S48].
5. **Community pain points.** Position memory, AoE ambiguity, dishonest-player exploits,
   descriptive burden [S23]; cognitive overload >2× enemies [S39]; "what do you want to do?" over
   "how far?" [S14b]; be generous, never precise 20% of the time after loose 80% [S16]; zones break
   OA/reach combos [S15]; house-rule attempts to replace OA with Engage actions [S49][S41].

---

## 7. Sources

| id   | Source                                                                                                                                                                                                                                                                                                                           | Date                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| S1   | Daggerheart SRD, "Maps, Range, and Movement" — https://daggerheartsrd.com/rules/maps-range-and-movement/ (mirror of daggerheart.org/core-mechanics/maps-range-and-movement)                                                                                                                                                      | SRD 2025                |
| S2   | Demiplane Daggerheart Nexus — weapon statistics rule page https://app.demiplane.com/nexus/daggerheart/rules/weapon-statistics and exported sheet PDF https://content.demiplane.com/nexus/daggerheart/character/pdf/cad9acd8-bb1a-4cfd-97fc-b418707ba01b-fighter.pdf (active weapons show trait, range, damage die, type, burden) | 2025                    |
| S3   | Foundry module "Daggerheart: Distances" v0.2.7 — https://foundryvtt.com/packages/daggerheart-distances ; https://github.com/brunocalado/daggerheart-distances                                                                                                                                                                    | 2026-08                 |
| S4   | Foundryborne Daggerheart system features — https://foundryborne.online/features/                                                                                                                                                                                                                                                 | 2026                    |
| S5   | 13th Age SRD, Combat Rules — https://www.13thagesrd.com/combat-rules/                                                                                                                                                                                                                                                            | current                 |
| S6   | Fate System Toolkit, Zones — https://fate-srd.com/fate-system-toolkit/zones                                                                                                                                                                                                                                                      | current                 |
| S6b  | Evil Hat, "Hack: use your grid maps with Fate" — https://evilhat.com/hack-use-your-grid-maps-with-fate/                                                                                                                                                                                                                          | n.d.                    |
| S7   | Run a Game, "Smarter Theater of the Mind Mechanics" — https://www.runagame.net/2016/09/smarter-theater-of-mind-mechanics.html                                                                                                                                                                                                    | 2016-09-01              |
| S8   | Dungeon World SRD, Equipment (range tags) — https://www.dungeonworldsrd.com/equipment/                                                                                                                                                                                                                                           | current                 |
| S9   | ICRPG basic rules thread, Gamers Plane — https://gamersplane.com/forums/thread/33199/                                                                                                                                                                                                                                            | 2024-05-14              |
| S10  | Runehammer, 5e Hardcore Mode (zones, range, OA removed) — https://www.5esrd.com/gamemastering/alternative-rules-other-publishers/5e-hardcore-mode/                                                                                                                                                                               | 2020                    |
| S11  | Shadowdark distances close/near/far — https://ruckerworks.com/2026/04/8-rules-from-shadowdark-to-use-in-your-5e-game/ ; rules FAQ https://www.thearcanelibrary.com/blogs/shadowdark-blog/shadowdark-rules-faq                                                                                                                    | 2026-04 / 2024-12-18    |
| S12  | D&D 2024 Free Rules, Combat (Roll20 compendium mirror) — https://roll20.net/compendium/dnd5e/Rules:Combat?expansion=32231                                                                                                                                                                                                        | 2024                    |
| S13  | Sly Flourish, "Zone-based Combat in D&D" — https://slyflourish.com/fate_style_zones_in_5e.html                                                                                                                                                                                                                                   | 2020-08-03              |
| S14  | Sly Flourish, "Guide to Narrative 'Theater of the Mind' Combat" — https://slyflourish.com/guide_to_narrative_combat.html                                                                                                                                                                                                         | 2017-03-06              |
| S14b | Mike Shea on D&D Beyond, "How to Run Combat in the Theater of the Mind" — https://www.dndbeyond.com/posts/355-how-to-run-combat-in-the-theater-of-the-mind ; "Running D&D Combat with an Abstract Battle Map" https://slyflourish.com/the_abstract_battlemap.html                                                                | 2018-12-12 / 2021-03-29 |
| S15  | EN World, "Using Zones instead of Battlemaps" — https://www.enworld.org/threads/using-zones-instead-of-battlemaps.686370/                                                                                                                                                                                                        | 2022-03-01              |
| S16  | EN World, "[+] Best advice for running Theater of the Mind" — https://www.enworld.org/threads/best-advice-for-running-theater-of-the-mind.690972/                                                                                                                                                                                | 2022-08-24              |
| S17  | D&D Beyond, "Mid-Year Update: 2026 Development Roadmap" — https://www.dndbeyond.com/posts/2223-mid-year-update-d-d-beyonds-2026-development ; "2026 Development Roadmap" https://www.dndbeyond.com/posts/2132-d-d-beyonds-2026-development-roadmap                                                                               | 2026                    |
| S18  | D&D Beyond, "Roll for Initiative! Combat Tracking Comes to the Maps VTT" — https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the ; support "Combat Encounters on Maps" https://dndbeyond-support.wizards.com/hc/en-us/articles/46385529638164-Combat-Encounters-on-Maps                          | 2025                    |
| S19  | D&D Beyond, "How to Use Scene Prep" (Theater of the Mind Organizer) — https://www.dndbeyond.com/posts/2236-how-to-use-scene-prep-d-d-beyonds-new-prep-tool                                                                                                                                                                       | 2026-08                 |
| S20  | Vice, "Huge D&D Beyond Update Adds DM Scene Prep and Theater of the Mind Support" — https://www.vice.com/en/article/dungeons-and-dragons-huge-dd-beyond-update-adds-dm-scene-prep-and-theater-of-the-mind-support/                                                                                                               | 2026-08-31              |
| S21  | D&D Beyond forums, "DnD Beyond Reddit AMA - 2026-Feb-24" (WOTC_Zac on "theater of the mind mode") — https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/237796-dnd-beyond-reddit-ama-2026-feb-24                                                                                                              | 2026-02-24              |
| S22  | Oracle RPG, "Theater of the Mind Rules for Tactical RPG Combat" — https://oracle-rpg.com/2024/11/theater-of-the-mind-rules-for-tactical-combat/                                                                                                                                                                                  | 2024-11-29              |
| S23  | D&D Beyond forums, "Advice for online play - How do you handle 'Theatre of the Mind' Combat?" — https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/61313-advice-for-online-play-how-do-you-handle-theatre                                                                                                    | 2020-03-27              |
| S24  | Gambit's Premades (Foundry) README — https://github.com/gambit07/gambits-premades ; https://foundryvtt.com/packages/gambits-premades                                                                                                                                                                                             | 2025–2026               |
| S25  | Midi Quality of Life Improvements v14.0.11 — https://foundryvtt.com/packages/midi-qol                                                                                                                                                                                                                                            | 2026-07                 |
| S26  | Familiar VTT, combat guide (auto OA from token distance) — https://familiarvtt.com/guides/combat                                                                                                                                                                                                                                 | 2025–2026               |
| S27  | BG3 Reactions (enable + Ask checkboxes) — https://baldursgate3.wiki.fextralife.com/Reactions ; https://www.gamerguides.com/baldurs-gate-3/guide/gameplay/getting-started/reactions-explained-in-baldurs-gate-3                                                                                                                   | 2023–2024               |
| S28  | "Shield Spell Reaction Fix" (Nexus Mods 21056; documents the <5-over-AC rule and Larian's inverted check) — https://www.nexusmods.com/baldursgate3/mods/21056                                                                                                                                                                    | 2025                    |
| S29  | Solasta, "Dev Diary #1: Reaction System" — https://www.solasta-game.com/solasta-crown-of-the-magister/news/7-dev-diary-1-reaction-system                                                                                                                                                                                         | 2019-07-12              |
| S30  | Steam discussion, "How does the spell shield reaction work?" (prompt only if AC would suffice) — https://steamcommunity.com/app/1096530/discussions/0/3088885996480189847/                                                                                                                                                       | 2021                    |
| S31  | Draw Steel review (grid required) — https://gamingtrend.com/reviews/draw-steel-heroes-review/                                                                                                                                                                                                                                    | 2025                    |
| S32  | Shieldmaiden combat tracker features — https://shieldmaiden.app/tools/combat-tracker ; https://github.com/HarmlessKey/Shieldmaiden                                                                                                                                                                                               | 2026                    |
| S33  | Improved Initiative — https://improvedinitiative.app/ ; https://github.com/cynicaloptimist/improved-initiative                                                                                                                                                                                                                   | 2026                    |
| S34  | Kobold+ Fight Club on Roll20 GM Hub — https://gmhub.roll20.net/resources/kobold-plus-fight-club/ ; DungeonSolvers feature guide https://www.dungeonsolvers.com/features-and-functions-of-kobold-fight-club/                                                                                                                      | 2025                    |
| S35  | Avrae, DM Combat Guide (`-t`, `!i aoo`, `!i rc`) — https://avrae.readthedocs.io/en/latest/cheatsheets/dm_combat.html                                                                                                                                                                                                             | current                 |
| S36  | StartPlaying, "The New Player's Guide to Alchemy RPG" — https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg ; https://alchemyrpg.com/                                                                                                                                                        | 2024-04-09              |
| S37  | Puzzlebottom, TOTM — "A bespoke combat tracker for Theatre of the Mind style D&D" — https://github.com/Puzzlebottom/totm/                                                                                                                                                                                                        | 2024–2026               |
| S38  | "Text-based Combat Tracking for D&D on Discord" — https://www.goodreads.com/author_blog_posts/20133629-text-based-combat-tracking-for-d-d-on-discord                                                                                                                                                                             | 2020-07-19              |
| S39  | Twilight Dreams, "improving theater of the mind combat" — https://twilightdreams.substack.com/p/improving-theater-of-the-mind-combat                                                                                                                                                                                             | 2025-03-01              |
| S40  | Larian forums, "Reactions like Solasta!" — https://forums.larian.com/ubbthreads.php?ubb=printthread&Board=90&main=95911&type=thread                                                                                                                                                                                              | 2021                    |
| S41  | Optional Rule, "Movement in Theater of the Mind for DnD 5e" (Engage/Avoid/Line Up A Shot/Intercept, opposed checks) — https://www.optionalrule.com/2024/10/20/theater-of-the-mind-movement-in-5e/ ; EN World mirror thread https://www.enworld.org/threads/movement-in-theater-of-the-mind-for-dnd-5e.707457/                    | 2024-10-20              |
| S42  | RPGnet, "No Minis (Theatre of The Mind) - D&D, Savage Worlds" — https://forum.rpg.net/index.php?threads/no-minis-theatre-of-the-mind-d-d-savage-worlds.861981/ ; RPG Pub "Savage Worlds - experimenting with a simple Roll20 setup" https://www.rpgpub.com/threads/savage-worlds-experimenting-with-a-simple-roll20-setup.10217/ | 2019–2022               |
| S43  | Foundry "Theater of the Mind - DM Tool" — https://foundryvtt.com/packages/theater-of-the-mind ; "Hide Combat Tracker" https://stendarpaval.itch.io/hide-combat-tracker                                                                                                                                                           | 2023–2025               |
| S44  | Owlbear Rodeo Initiative Tracker docs — https://docs.owlbear.rodeo/extensions/examples/initiative-tracker/ ; extensions directory https://extensions.owlbear.rodeo/ ; "Theatre!" https://extensions.owlbear.rodeo/theatre ; Hex Range https://extensions.owlbear.rodeo/pulpscape-hex-range                                       | 2025–2026               |
| S45  | Roll20 blog, "D&D 2024 Automations are Here!" — https://blog.roll20.net/posts/dd-2024-automations-are-here/                                                                                                                                                                                                                      | 2025-11-13              |
| S46  | Roll20 Wiki, D&D 2024 sheet (Shield under Effects, not Reactions) — https://wiki.roll20.net/D&D_2024                                                                                                                                                                                                                             | 2025                    |
| S47  | D&D Beyond forums, "Adding trackers to actions bonus actions and reactions" — https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/180775-adding-trackers-to-actions-bonus-actions-and                                                                                                                        | 2023                    |
| S48  | D&D Beyond forums, "Concealment, Readied Spell Trigger and Counterspell" — https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/42088-concealment-readied-spell-trigger-and-counterspell                                                                                                            | 2019                    |
| S49  | EN World, "The Engage Action" (5E 2024 house rule) — https://www.enworld.org/threads/the-engage-action.720013/                                                                                                                                                                                                                   | 2026-07-24              |

Not reachable from this harness (recorded so nobody re-tries): Reddit (blocked crawler), RPG Pub
"Tools for zone-based combat?" (HTTP 402), TechRaptor Alchemy interview and Demiplane FAQ/rules
pages (HTTP 403 or SPA shell), rpg.net ICRPG review (redirect to forum root).
