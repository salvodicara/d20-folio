/**
 * Guard: NO cross-locale / locked-namespace i18n fetch in the UI layer.
 *
 * ## Why (the SEV-1 it pins)
 *
 * `i18n.getFixedT(<locale>)(...)` fetches a SPECIFIC locale's translation,
 * bypassing the active-locale `t`. That is ONLY safe where the target locale's
 * namespace is guaranteed loaded — i.e. in `src/i18n/**` (which owns loading) and
 * the presenter `src/lib/views/**` (which resolves a `LocText`'s `ui` ref through
 * the always-loaded EN/active `common`). In a FEATURE/COMPONENT it is a loaded-bug
 * landmine: the app loads only the ACTIVE locale's `common` (ui) namespace at
 * startup (plus EN srd, and — since the fix — EN `common`). Before the fix,
 * `PlayTab.tsx`'s off-list reaction called `getFixedT("en")(...)` and
 * `getFixedT("it")(...)` to freeze a both-locale label. In an ITALIAN session the
 * EN `common` namespace wasn't loaded, so `getFixedT("en")("combat.otherReactionName")`
 * MISSED → the dev/test missing-key handler THREW and the character's Play tab
 * white-screened behind the error boundary (raw key in prod). The key EXISTED in
 * both `{en,it}/ui/combat.json` — it was a LOADING bug, not a translation gap.
 *
 * The root-cause fix made EN `common` always-loaded (a real fallback) AND replaced
 * the in-feature cross-locale fetch with a `ui` `LocText` ref resolved at the
 * presenter edge (`localizeText` → `i18n.getFixedT(locale)`). This guard keeps the
 * landmine from being re-laid: a cross-locale/locked-namespace fetch belongs ONLY
 * in `src/i18n/**` + `src/lib/views/**`, NEVER in `src/features/**` or
 * `src/components/**`.
 *
 * Fail-before (3 hits in `PlayTab.tsx`) / pass-after (0 hits).
 */
import { describe, it, expect } from "vitest";
import { sep } from "node:path";
import { srcFiles, readSrc, SRC_ROOT } from "./__helpers__/src-files";

/** The two UI subtrees a cross-locale fetch must never appear in. */
const FORBIDDEN_DIRS = [
  SRC_ROOT + sep + "features" + sep,
  SRC_ROOT + sep + "components" + sep,
] as const;

/** Match a real `getFixedT(` CALL (not the token in prose/comments-with-no-paren). */
const GET_FIXED_T_CALL = /\bgetFixedT\s*\(/;

describe("no cross-locale i18n fetch in features/components", () => {
  it("getFixedT( appears nowhere under src/features/** or src/components/**", () => {
    const offenders: string[] = [];
    for (const dir of FORBIDDEN_DIRS) {
      for (const file of srcFiles({ under: dir.slice(0, -1), exts: [".ts", ".tsx"] })) {
        const content = readSrc(file);
        if (GET_FIXED_T_CALL.test(content)) {
          const line = content.split("\n").findIndex((l) => GET_FIXED_T_CALL.test(l)) + 1;
          offenders.push(`${file.slice(SRC_ROOT.length + 1)}:${line}`);
        }
      }
    }
    expect(
      offenders,
      `Cross-locale/locked-namespace fetch (getFixedT) found in the UI layer:\n` +
        `${offenders.join("\n")}\n` +
        `These belong ONLY in src/i18n/** (owns loading) or src/lib/views/** (the\n` +
        `presenter, which resolves a LocText 'ui' ref via the always-loaded common ns).\n` +
        `In a feature/component the target locale may be unloaded → missing-key crash\n` +
        `(the combat.otherReactionName IT-session white-screen). Use a 'ui' LocText ref\n` +
        `(uiText) resolved through localizeText instead.`
    ).toEqual([]);
  });
});
