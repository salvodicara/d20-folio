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

Also exported: the rules grammar (`compileGrant`, `foldRules`, `ruleNumber`, `ruleFlag`) and
the session log (`foldSession`, `buildReport`). The SRD catalogue ships separately as static
JSON (`/srd/v1/index.json`).

Build: `pnpm core:build` (from the repository root). Not published yet.
