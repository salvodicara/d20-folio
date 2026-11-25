# Gap map — new UI, the DM's side (campaign screen)

What the DM can do in the classic campaign hub (`src/features/campaigns/`), and whether the
new campaign screen (`src/domains/campaign/ui/CampaignScreen.tsx`, VITE_NEW_UI build) does it.
Written 2026-11-25 on `main` 01b182f7c. It sequences item 6 of
[new-ui-build-plan.md](new-ui-build-plan.md); [new-ui-wiring.md](new-ui-wiring.md) holds the
owner's earlier decisions it respects.

## How to read it

- **Status:** `done` (the new screen does it), `partial`, `missing`, or `decided` (an owner
  decision replaced the classic behaviour; no slice).
- **Headless:** `ready` when the writer or view model already exists and is tested, but no
  new-UI screen uses it. Those rows are wiring work, so they are small.
- **Size:** S (one control, under a day), M (a pane or a dialog), L (a new flow).
- **Pattern sources** (public pages, read 2026-11-25; patterns only, in our own words):
  - **DDB-E**: D&D Beyond encounter builder and combat tracker,
    <https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d>
  - **DDB-M**: D&D Beyond Maps initiative and conditions,
    <https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the>,
    <https://www.dndbeyond.com/posts/2212-condition-tracking-comes-to-the-maps-vtt>
  - **FVTT-C**: Foundry VTT combat tracker, <https://foundryvtt.com/article/combat/>
  - **FVTT-J**: Foundry VTT journal, <https://foundryvtt.com/article/journal/>
  - **FVTT-G**: Foundry dnd5e group actor (party sheet, award), from the dnd5e 3.0 release
    notes, <https://newreleases.io/project/github/foundryvtt/dnd5e/release/release-3.0.0>.
    Partly verified: check the sheet itself before building.
  - Roll20's turn tracker help pages refused access (403). No row relies on Roll20 alone.
- **Tests:** `tests/e2e-rehearsal/06-dm-tools.spec.ts` covers the **new** screen (add two
  goblins, damage both, Prone on one, end). The classic DM rehearsals are
  `classic-dm-edits.spec.ts` (hide and reveal survive another device's write, offline) and
  `classic-peer-spend.spec.ts` (a DM hit spends a claimed Uncanny Dodge).

## The map

Ordered by what the DM needs at the table first. The «Slice» column names the PR that closes
the row; rows with the same slice ship together.

### A. The fight (Scontro tab)

| #   | Capability                                                                    | Classic                                         | New UI                                                            | Headless                                                                                         | Pattern                                                               | Size | Slice                                                                         |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| 1   | Start a fight, roll, «Tira per chi manca», next/back turn, round, end, reopen | `Party.tsx`                                     | done                                                              | —                                                                                                | DDB-E, FVTT-C                                                         | —    | —                                                                             |
| 2   | Add monsters: search, CR filter, count, difficulty as you pick                | `encounter-bestiary.tsx`                        | done (`AddMonstersDialog`)                                        | —                                                                                                | DDB-E                                                                 | —    | —                                                                             |
| 3   | Damage or heal one or many creatures, with a damage type                      | `party-encounter.tsx` HpVital, MonsterHpControl | done (`DmHitDialog`, chips per target)                            | —                                                                                                | DDB-E, FVTT-C                                                         | —    | —                                                                             |
| 4   | Conditions on a creature or a hero                                            | ConditionEditor on each card                    | done (one target at a time)                                       | —                                                                                                | DDB-M                                                                 | —    | —                                                                             |
| 5   | Hide a creature from the players (ambush), and show it again                  | MonsterCard «Hide»                              | missing                                                           | ready (`setCombatantHiddenMove`)                                                                 | FVTT-C (hidden combatant, players' tracker skips it)                  | S    | **S1**                                                                        |
| 6   | Show the players a monster's exact Hit Points                                 | MonsterCard «Reveal HP»                         | missing: players never see a monster's number, not even an ally's | ready (`setMonsterRevealedMove`)                                                                 | DDB-E (monster HP is the DM's), FVTT-C                                | S    | **S1**                                                                        |
| 7   | Switch a creature between enemy and ally                                      | MonsterCard                                     | missing                                                           | ready (`setMonsterSideMove`)                                                                     | DDB-M (party vs enemies)                                              | S    | **S1**                                                                        |
| 8   | Edit a monster's initiative; move a line up or down in the order              | MonsterInitChip, drag and keyboard reorder      | missing                                                           | ready (`setMonsterInitiativeMove`, `reorderCombatantMove`)                                       | DDB-E (type the number, the list re-sorts), FVTT-C (update combatant) | M    | **S2**                                                                        |
| 9   | The DM types a hero's d20 for a player without the app                        | PcReadyCard InitVital                           | missing («Tira per chi manca» rolls for them instead)             | partial                                                                                          | DDB-E (type the initiative by hand)                                   | S    | S2                                                                            |
| 10  | Remove a creature from the fight                                              | MonsterCard «Remove»                            | missing                                                           | engine only (`removeCombatant`), no move                                                         | FVTT-C                                                                | S    | S3                                                                            |
| 11  | Temp HP on a monster                                                          | MonsterHpControl                                | missing (the dialog has Damage and Heal)                          | engine only (`setMonsterTempHp`)                                                                 | DDB-E (HP box menu: Damage/Heal, Temp HP)                             | S    | S3                                                                            |
| 12  | Monster card: stat block, rename, AC, private notes                           | MonsterCard body                                | missing                                                           | engine only (`setMonsterName`, `setMonsterAc`, `setMonsterNotes`); `MonsterStatBlockCard` exists | DDB-E (stat block beside the tracker)                                 | M    | S4                                                                            |
| 13  | Monster actions: one tap on an attack or save, pick targets, apply            | `encounter-monster-actions.tsx`                 | partial (area spells only: `MonsterZoneCast`)                     | partial                                                                                          | FVTT-C with dnd5e chat card «apply damage» (unverified detail)        | L    | S6                                                                            |
| 14  | Limited uses: Recharge, N/Day, legendary actions                              | none (new)                                      | missing                                                           | ready (`monster-uses-view.ts`)                                                                   | DDB-E stat block counters (check before building)                     | M    | S5                                                                            |
| 15  | Trait chips (Pack Tactics …) and one-tap Regeneration                         | `encounter-trait-chips.tsx`                     | missing                                                           | ready (`encounter-trait-facts.ts`)                                                               | — (classic precedent)                                                 | M    | S6                                                                            |
| 16  | Hero death saves ticked by the DM                                             | DeathSaveTicks                                  | missing                                                           | —                                                                                                | DDB sheet (players tick their own)                                    | M    | ask: peer write on a player's sheet                                           |
| 17  | The DM's own monsters: create, edit, delete, portrait                         | `encounter-custom-monsters.tsx`                 | partial (picked in «Aggiungi mostri»; not created there)          | ready (`custom-monsters.ts`)                                                                     | DDB-E (manual entry form)                                             | M    | S7                                                                            |
| 18  | Live feed: undo or retract a line, write a note, «who struck?»                | `party-chronicle.tsx`                           | partial (feed is read-only; every move has its toast undo)        | partial                                                                                          | FVTT chat log (unverified)                                            | M    | S8                                                                            |
| 19  | Alert-feat initiative swap                                                    | Party alert swap modal                          | missing                                                           | engine only (`setInitiativeSwap`)                                                                | — (classic precedent)                                                 | S    | S8                                                                            |
| 20  | Bardic Inspiration die spent on a monster                                     | MonsterCard                                     | missing                                                           | engine only                                                                                      | — (classic precedent)                                                 | S    | S8                                                                            |
| 21  | Arrow keys pass and step back the turn                                        | `useTurnAdvanceShortcut`                        | missing                                                           | —                                                                                                | FVTT-C                                                                | S    | S8                                                                            |
| 22  | A roster creature (the DM's standing NPC) joins the fight                     | none (new)                                      | missing                                                           | ready (`addRosterToFight`)                                                                       | DDB-M («Add to encounter»)                                            | S    | S7                                                                            |
| 23  | End of fight: title, note, outcome, «save to the Chronicle»                   | `party-chronicle.tsx` EndEncounterDialog        | decided                                                           | `fight-write-up.ts`                                                                              | —                                                                     | —    | none: the Diario's automatic report replaces it (wiring doc, «no chapter UI») |
| 24  | The DM heals heroes                                                           | HpVital                                         | decided                                                           | —                                                                                                | —                                                                     | —    | none: the DM heals monsters only; a hero heals on their own sheet             |
| 25  | Who may pass the turn                                                         | DM or the current hero                          | decided                                                           | —                                                                                                | —                                                                     | —    | none: anyone passes (owner 2026-10-23)                                        |

### B. The party (Gruppo tab)

| #   | Capability                                                                                   | Classic               | New UI                     | Headless                        | Pattern                       | Size | Slice |
| --- | -------------------------------------------------------------------------------------------- | --------------------- | -------------------------- | ------------------------------- | ----------------------------- | ---- | ----- |
| 26  | One row per hero: HP, AC, passive Perception, conditions, concentration                      | `Party.tsx` cards     | done                       | —                               | DDB app Characters tab        | —    | —     |
| 27  | Open a hero's sheet read-only                                                                | `MemberSheetView.tsx` | done (`MemberSheetScreen`) | —                               | DDB campaign page             | —    | —     |
| 28  | Party table: Insight and Investigation passives, speed, senses, six saves, best value marked | `PartySummary.tsx`    | partial (Perception only)  | partial (`party-summary.ts`)    | FVTT-G (party sheet), DDB app | M    | S9    |
| 29  | The DM plays a character too (attach a DMPC)                                                 | DmpcAttachControl     | missing                    | partial (`attach-character.ts`) | — (classic precedent)         | S    | S10   |

### C. Running the campaign

| #   | Capability                                                          | Classic                                   | New UI                                           | Headless                    | Pattern                              | Size | Slice |
| --- | ------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ | --------------------------- | ------------------------------------ | ---- | ----- |
| 30  | Copy the invite link                                                | CampaignInvite                            | done (header)                                    | —                           | DDB campaign page                    | —    | —     |
| 31  | Delete the campaign                                                 | DmTools                                   | done (⋮ on the campaigns list)                   | —                           | DDB                                  | —    | —     |
| 32  | Set, change or clear the next session date                          | `LastTime.tsx`                            | partial (the header shows it; nobody can set it) | ready (`session-moves.ts`)  | DDB campaign page (unverified)       | S    | S10   |
| 33  | Hand the DM role to a player; remove a player; lock the invite link | `DmTools.tsx`, CampaignInvite             | missing                                          | ready (`campaign-admin.ts`) | DDB campaign management (unverified) | M    | S11   |
| 34  | Rename the campaign; set or crop its banner                         | CampaignHubPage, `CampaignArtControl.tsx` | missing                                          | partial                     | DDB campaign page                    | S    | S11   |

### D. Journal, notes, treasure

| #   | Capability                                             | Classic                | New UI                                       | Headless | Pattern                          | Size | Slice                    |
| --- | ------------------------------------------------------ | ---------------------- | -------------------------------------------- | -------- | -------------------------------- | ---- | ------------------------ |
| 35  | Shared notes; the DM hides one from the players        | `SharedNotes.tsx`      | done (`NotesTab`)                            | —        | FVTT-J (per-player access)       | —    | —                        |
| 36  | The evening's automatic report, copy                   | `SessionDayReport.tsx` | done (`DiaryTab`)                            | —        | FVTT-J                           | —    | —                        |
| 37  | Sessions: write the evening's text                     | `Sessions.tsx`         | done (an evening is its play log)            | —        | FVTT-J                           | —    | —                        |
| 38  | Chronicle book: chapters, versions and restore, export | `Chronicle.tsx`        | decided (read-only under «Tutta la cronaca») | —        | —                                | —    | none: wiring doc, Diario |
| 39  | Coins in and out, ledger, undo                         | `Treasury.tsx`         | done (`TreasuryTab`)                         | —        | FVTT-G                           | —    | —                        |
| 40  | Loot: items in a chest, equal shares                   | none (new)             | done                                         | —        | FVTT-G (award «each» or «split») | —    | —                        |
| 41  | Table rules                                            | none (new)             | done (`RulesTab`)                            | —        | —                                | —    | —                        |

## Slices, in order

1. **S1 — who the players see** (rows 5–7): in «Danni e cure», a «Per i giocatori» group for
   the chosen creatures: hidden, exact HP shown, ally. The DM's line marks a hidden creature;
   a player's line shows the number of a revealed monster or an ally.
2. **S2 — the turn order** (rows 8–9): the DM edits an initiative in place; the list re-sorts.
3. **S3 — remove a creature, monster temp HP** (rows 10–11): needs two small moves.
4. **S4 — the monster card** (row 12): the stat block, rename, AC, notes.
5. **S5 — limited uses** (row 14).
6. **S6 — monster actions and traits** (rows 13, 15).
7. **S7 — the DM's own monsters and roster creatures** (rows 17, 22).
8. **S8 — the feed and the small classic extras** (rows 18–21).
9. **S9 — the party table** (row 28).
10. **S10 — next session date, DMPC** (rows 29, 32).
11. **S11 — campaign management** (rows 33–34).

Open question for the coordinator: row 16 (the DM ticks a hero's death saves) writes on a
player's sheet. Today only the DM's hit and conditions do that, through the peer-write path.

## Out of scope (logged)

- A party rest called by the DM, and XP or milestone awards (FVTT-G has both; classic has
  neither).
- Drag to reorder on a phone (a new control; S2 uses the number instead).
