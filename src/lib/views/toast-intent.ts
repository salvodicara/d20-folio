/**
 * Toast intents — the toasts-as-data seam (docs/ARCHITECTURE.md).
 *
 * The engine (`stores/characterStore.ts`) must NOT localize. Instead of pushing a
 * pre-localized `message` string, the store emits a STRUCTURED intent — a `kind`
 * discriminant plus raw args (numbers + STABLE ids, never display prose). The UI
 * layer (`UndoToasts` via the `useToasts` hook) localizes the intent at render:
 * it picks the i18n template by `kind` and resolves any id arg (e.g. a condition
 * id → its localized name) at the call site. This honors ids-are-the-only-source-
 * of-truth and makes the store unit-testable with no i18n runtime.
 *
 * This module is PURE presentation glue: it owns the kind→key mapping and the
 * id→name resolution, taking the `t` function + a name resolver as parameters so
 * it stays framework-free (no React, no stores, no i18next import). `lib/views/`
 * is the ONLY engine-side layer permitted to localize — and even here the actual
 * `t`/`localizeSrd` are injected, never imported.
 */

import type { SessionDefenseKind } from "@/types/character";
import type { ToastIntent } from "@/types/toast";

export type { ToastIntent };

/** The i18n key each intent kind localizes through. */
const TOAST_INTENT_KEY: Record<
  Exclude<ToastIntent["kind"], "defense-removed">,
  string
> = {
  "concentration-dropped": "combat.concentrationDroppedToast",
  "concentration-save": "combat.concentrationSaveToast",
  "concentration-replaced": "combat.concentrationReplacedToast",
  "stopped-concentrating": "combat.stoppedConcentratingToast",
  "condition-removed": "combat.conditionRemovedToast",
};

/**
 * PLAY-NO-EDIT — `defense-removed` picks its template by the defense KIND (each
 * kind is its own grammatical unit in IT, so one parameterized template can't
 * cover them).
 */
const DEFENSE_REMOVED_KEY: Record<SessionDefenseKind, string> = {
  resistance: "combat.resistanceRemovedToast",
  immunity: "combat.immunityRemovedToast",
  vulnerability: "combat.vulnerabilityRemovedToast",
  conditionImmunity: "combat.conditionImmunityRemovedToast",
};

/**
 * The minimal `t` shape this presenter needs — the i18next translator. Kept as a
 * structural type so the module does not import `react-i18next` (engine-side
 * layers stay framework-free; the hook injects the real `t`).
 */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

/**
 * Resolve a stable condition id to its localized display name. Injected by the
 * UI so this module never imports the SRD-name resolver or a store.
 */
export type ResolveConditionName = (conditionId: string) => string;

/**
 * Resolve a stored concentration value (a spell's stable srdId — or a custom
 * spell's name) to its localized display name. Injected by the UI (the
 * `concentrationLabel` presenter) so this module never imports the SRD resolver
 * or a store. Concentration is stored as an id (golden rule 7), so every
 * concentration spell arg is wrapped through this.
 */
export type ResolveSpellName = (value: string) => string;

/**
 * Localize a toast intent into a render-ready message. Pure: every locale-bearing
 * dependency (`t`, condition-name + spell-name resolvers) is passed in, so this is
 * unit-testable with trivial fakes and carries no framework import.
 */
export function localizeToastIntent(
  intent: ToastIntent,
  t: TranslateFn,
  resolveConditionName: ResolveConditionName,
  resolveSpellName: ResolveSpellName
): string {
  if (intent.kind === "defense-removed") {
    // A condition-immunity id is a ConditionId (localized via the injected
    // resolver); the damage kinds carry a DamageType (the `srd.damage_*` keys).
    const name =
      intent.defenseKind === "conditionImmunity"
        ? resolveConditionName(intent.defenseId)
        : t(`srd.damage_${intent.defenseId}`);
    return t(DEFENSE_REMOVED_KEY[intent.defenseKind], { name });
  }
  const key = TOAST_INTENT_KEY[intent.kind];
  switch (intent.kind) {
    case "concentration-dropped":
      return t(key, { spell: resolveSpellName(intent.spell) });
    case "concentration-save":
      // RA-15 — two keys, one per grammatical unit (IT grammar differs, and no
      // translatable text may live in TS): the advantage template appends the
      // Advantage/Vantaggio word; `key` stays the no-advantage default.
      return t(intent.advantage ? "combat.concentrationSaveAdvantageToast" : key, {
        spell: resolveSpellName(intent.spell),
        dc: intent.dc,
        save: intent.saveBonus >= 0 ? `+${intent.saveBonus}` : String(intent.saveBonus),
      });
    case "concentration-replaced":
      return t(key, {
        previous: resolveSpellName(intent.previous),
        next: resolveSpellName(intent.next),
      });
    case "stopped-concentrating":
      return t(key, { spell: resolveSpellName(intent.spell) });
    case "condition-removed":
      return t(key, { condition: resolveConditionName(intent.conditionId) });
  }
}
