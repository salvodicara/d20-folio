# @d20-folio/core changelog

Each release lists, in a `diff` block, the public names it adds (`+`) and removes (`-`),
as they appear in [`api.txt`](api.txt). A removed or renamed name breaks callers: it
takes a major release (a minor one while the version is 0.x). An added name takes at
least a minor release (a patch one while 0.x). Behaviour changes with no change to the
names take a patch release. The test `tests/unit/folio-core-changelog.test.ts` replays
this file against `api.txt` and the package's version, so the surface cannot change
without its release.

To change the surface: update `api.txt` (see the README), add a release section at the
top with its `+`/`-` lines, and set the same version in `package.json`.

## 0.24.1 — 2026-11-11

The first pinned surface: reading a character export, its derived sheet and every sheet
number, the rules grammar, activities, the session log, shared combat, the treasury,
attunement and notes in play. Not published yet.

<details>
<summary>The 100 public names</summary>

```diff
+ type Activity
+ type ActivityCost
+ type ActivityEffect
+ type ActivityGap
+ type ActivitySource
+ type ActivityTarget
+ type ActivityTranslation
+ type AttunementRefusal
+ type AttuneResult
+ type CampaignHoldings
+ type CanAttune
+ type CharacterData
+ type CharacterDoc
+ type CharacterSheet
+ type EncounterClock
+ type EncounterEnded
+ type EncounterEndReason
+ type EncounterState
+ type Explained
+ type Grant
+ type Holdings
+ type ImportError
+ type ImportResult
+ type ItemHoldings
+ type ItemMove
+ type LogItem
+ type LootAssignment
+ type NoteLine
+ type NoteMarks
+ type PlayEvent
+ type PlayEventKind
+ type PrivateNote
+ type PrivateNoteLine
+ type Purse
+ type ReportSection
+ type RollInitiativeInput
+ type Rule
+ type RuleTarget
+ type RuleValues
+ type SessionEntry
+ type SessionState
+ type SheetNumbers
+ type TreasuryItem
+ type TreasuryMove
+ type TreasuryOutside
+ type TreasuryOwner
+ value activityFromBeastAttack
+ value activityFromCompanionAttack
+ value activityFromItemActivation
+ value applyItemMove
+ value applyMove
+ value attuneItem
+ value ATTUNEMENT_LIMIT
+ value attunementLimit
+ value authorDiarioNotes
+ value buildReport
+ value campaignHoldings
+ value canAdvanceTurn
+ value canAttune
+ value catalogueActivities
+ value COINS
+ value compileGrant
+ value deriveCharacter
+ value emptyPurse
+ value encounterEndReason
+ value endCombat
+ value foldRules
+ value foldSession
+ value IDLE_END_MS
+ value isHandSet
+ value lootMoves
+ value mayStepTurn
+ value noteLines
+ value ownerKey
+ value parseCharacter
+ value parseNote
+ value passTurn
+ value privateNoteDraft
+ value privateNoteLines
+ value purseValueCp
+ value reopenCombat
+ value resolveMentions
+ value reverseItemMove
+ value reverseMove
+ value rollInitiative
+ value ruleFlag
+ value ruleFlagIds
+ value ruleNumber
+ value ruleNumberIds
+ value ruleValue
+ value SCHEMA_VERSION
+ value serializeCharacter
+ value sheetNumbers
+ value touch
+ value translateAction
+ value translateMonsterEntry
+ value translateSpell
+ value translateWeapon
+ value turnBack
+ value unattuneItem
```

</details>
