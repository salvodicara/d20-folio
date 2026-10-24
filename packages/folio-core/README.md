# @d20-folio/core

The d20 Folio rules engine as a library — the same code the app runs, SRD 5.2.1 content
only (see `NOTICE`).

```ts
import { parseCharacter, deriveCharacter } from "@d20-folio/core";

const parsed = parseCharacter(jsonFromFolioExport); // a Folio character export (schema 3)
if (parsed.success) {
  const sheet = deriveCharacter({
    id: "x",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...parsed.doc,
  });
  sheet.ac; // 15
  sheet.saves; // [{ ability: "STR", bonus: 7, proficient: true }, …]
  sheet.spellcasting?.saveDc;
}
```

Also exported: the rules grammar (`compileGrant`, `foldRules`, `ruleNumber`, `ruleFlag`),
activities (`catalogueActivities()` — every SRD spell, feature action, monster entry and
form attack in one `Activity` shape — and the translators `translateSpell`, `translateAction`,
`translateMonsterEntry`, …) and the session log (`foldSession`, `buildReport`). The SRD catalogue ships separately as static
JSON (`/srd/v1/index.json`).

Since 0.24.1, also the pure core the new app is built on:

- `sheetNumbers(doc)`: every sheet number as `{ total, parts }` (the parts sum to the
  total; a hand-set number keeps the computed parts plus one manual-adjustment part, read
  with `isHandSet(parts)`; parts are null only for a homebrew max HP).
- Shared combat: `rollInitiative` (the first roll starts the fight), `passTurn` /
  `turnBack`, `encounterEndReason`, `endCombat` / `reopenCombat`.
- The treasury: `lootMoves`, `applyMove` / `reverseMove`, `campaignHoldings`, and
  `applyItemMove` / `reverseItemMove` for items.
- Notes in play: `parseNote` (@who, #where, !important), `noteLines`, and the private
  notes (`privateNoteDraft`, `authorDiarioNotes`).

Build: `pnpm core:build` (from the repository root). Not published yet.
