/**
 * `nameLoc` — the combat-log action reference is a localizable NAME, not a raw id.
 *
 * THE BUG THIS PINS (a BLOCKER correctness regression the green suite missed):
 * the combat log used to store an action reference computed by `actionRefFor`,
 * whose discriminator (`if (action.nameEn === undefined) → custom`) was
 * STRUCTURALLY DEAD — `localizeAction` always sets `nameEn`, so the branch never
 * fired. Every SRD feature action therefore fell to `{ kind: "feature", id }` and
 * the log rendered its raw, ECONOMY-SUFFIXED row id (Bardic Inspiration →
 * "bard-bardic-inspiration-bonus", Second Wind → "fighter-second-wind-bonus",
 * Dash → "base-dash", Uncanny Dodge → "rogue-uncanny-dodge-reaction"), because
 * `grantSourceLabel` resolves only the BARE id; and every base / custom action
 * dropped to its id too. Only SRD spells/weapons (which carried `spellId`/
 * `weaponId`) localized.
 *
 * THE FIX: `localizeAction` carries the action's NAME as the engine's
 * localizable {@link LocText} ref (`nameLoc`) — the SAME `name` ref the raw action
 * already held (an `srd` catalogue id-ref for SRD spell/weapon/feature/item, a
 * `lit` bilingual constant for a base action like Dash, a `custom` string for
 * homebrew). The log stores THAT ref and resolves it via `localizeText`, so EVERY
 * action class re-localizes to its correct display name in any locale.
 *
 * This test drives the REAL pipeline — `resolveActions(MOCK_CHARACTER)` then
 * `localizeAction(rawAction, locale)` — and asserts, for every action class the
 * mock yields (SRD spell, SRD weapon, SRD class-feature, an item action, and a
 * base action like Dash), that `nameLoc` localizes (EN + IT) to the CORRECT name
 * and NEVER to a raw economy-suffixed id. It FAILS on the pre-fix code (where the
 * feature/base/custom names rendered as raw ids).
 */
import { describe, it, expect } from "vitest";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { uiText } from "@/lib/loc-text";
import { MOCK_CHARACTER } from "@/lib/mock";

// The real engine list, resolved once (locale-free), and a lookup by stable id.
const RAW: RawResolvedAction[] = resolveActions(MOCK_CHARACTER);
const byId = new Map(RAW.map((a) => [a.id, a]));

/** Localize a resolved action's stored `nameLoc` ref for the log, in one locale. */
function loggedName(id: string, locale: "en" | "it"): string {
  const raw = byId.get(id);
  if (!raw) throw new Error(`mock yields no action with id "${id}"`);
  return localizeText(localizeAction(raw, locale).nameLoc, locale);
}

describe("combat-log action ref (nameLoc) localizes every action class — never a raw id", () => {
  // The id the mock yields per class is ECONOMY-SUFFIXED (e.g. "...-bonus") — the
  // exact raw token the pre-fix log leaked. Each row pins the correct EN + IT name
  // AND that neither equals the raw id.
  const cases: Array<{
    label: string;
    id: string;
    en: string;
    it: string;
  }> = [
    // ── The previously-BROKEN classes (these FAIL on the old `actionRefFor`) ──
    {
      label: "SRD class-feature, bonus action (Bardic Inspiration)",
      id: "bard-bardic-inspiration-bonus",
      en: "Bardic Inspiration",
      it: "Ispirazione Bardica",
    },
    {
      label: "SRD class-feature, heal bonus action (Second Wind)",
      id: "fighter-second-wind-bonus",
      en: "Second Wind",
      it: "Recuperare Energie",
    },
    {
      label: "SRD class-feature, reaction (Uncanny Dodge)",
      id: "rogue-uncanny-dodge-reaction",
      en: "Uncanny Dodge",
      it: "Schivata Prodigiosa",
    },
    {
      label: "base action (Dash) — a `lit` bilingual constant",
      id: "base-dash",
      en: "Dash",
      it: "Scatto",
    },
    {
      label: "item action (Potion of Healing)",
      id: "item-potion-of-healing",
      en: "Potion of Healing",
      it: "Pozione di Guarigione",
    },
    // ── The classes that localized even pre-fix (regression coverage) ────────
    {
      label: "SRD spell (Hypnotic Pattern)",
      id: "spell-hypnotic-pattern",
      en: "Hypnotic Pattern",
      it: "Trama Ipnotica",
    },
    {
      label: "SRD weapon (Rapier)",
      id: "weapon-rapier",
      en: "Rapier",
      it: "Stocco",
    },
  ];

  it.each(cases)("$label", ({ id, en, it }) => {
    expect(loggedName(id, "en")).toBe(en);
    expect(loggedName(id, "it")).toBe(it);
    // The hard guard: the logged name is NEVER the raw economy-suffixed id (the
    // exact symptom of the dead-branch bug) in EITHER locale.
    expect(loggedName(id, "en")).not.toBe(id);
    expect(loggedName(id, "it")).not.toBe(id);
    // …nor the bare (un-suffixed) id either — `grantSourceLabel` resolves the
    // bare feature id, so a raw-id leak could surface that too.
    const bareId = id.replace(/-(bonus|action|reaction|free)$/, "");
    expect(loggedName(id, "en")).not.toBe(bareId);
    expect(loggedName(id, "it")).not.toBe(bareId);
  });

  // The off-hand weapon row is the ONE documented residual: `nameLoc` is the base
  // weapon ref, so the "(off-hand)" suffix (added to the display `name` AFTER
  // localization in `localizeAction`) is absent from the logged ref. Acceptable —
  // the log reads the bare weapon name. Pinned so the residual is intentional.
  it("off-hand weapon logs the BASE weapon name (the documented suffix residual)", () => {
    const offhand = byId.get("weapon-dagger-offhand");
    if (!offhand) throw new Error("mock yields no off-hand dagger action");
    expect(offhand.offhand).toBe(true);
    // The display name carries the suffix; the stored log ref does not.
    expect(localizeAction(offhand, "en").name).toBe("Dagger (off-hand)");
    expect(loggedName("weapon-dagger-offhand", "en")).toBe("Dagger");
    expect(loggedName("weapon-dagger-offhand", "it")).toBe("Pugnale");
  });

  // ── The OFF-LIST reaction — a `ui` LocText ref (the SEV-1 IT-session crash) ──
  // PlayTab's synthetic "off-list reaction" row labels itself with a CHROME key
  // (`combat.otherReactionName`), so its `nameLoc` is a `ui` ref resolved at the
  // presenter edge by `localizeText`. The old code FROZE both faces via
  // `i18n.getFixedT("en")`/`("it")` inside the feature — but the app loads only the
  // active locale's `common` (ui) ns at startup, so in an IT session the EN ns was
  // unloaded → `getFixedT("en")` MISSED → the dev/test missing-key handler THREW and
  // the Play tab white-screened (raw key in prod). The existing render/locale tests
  // loaded EN as the ACTIVE locale, so `getFixedT("en")` resolved — that is exactly
  // why this slipped through. This pins the ref resolves in BOTH locales now that EN
  // `common` is always loaded (the canonical fallback). Cheapest test that pins the
  // fact (golden rule 13) — a pure `localizeText(uiText(...))` assertion, no mount.
  it("the off-list reaction's `ui` LocText ref resolves EN + IT (regression: the IT-session crash)", () => {
    const ref = uiText("combat.otherReactionName");
    expect(localizeText(ref, "en")).toBe("Other reaction");
    expect(localizeText(ref, "it")).toBe("Altra reazione");
  });
});
