/**
 * The concentration label, on its own so the app shell (the undo toasts) can show it
 * without pulling the cockpit tracker presenters and the combat engine onto first
 * paint (tests/unit/eager-graph.guard.test.ts).
 */
import { localizeSrd } from "@/i18n/resolver";
import { customConcentrationName } from "@/lib/concentration";
import type { Locale } from "@/lib/locale";

/**
 * Localize the stored concentration value for display. `session.concentration` is
 * a STABLE id by construction (golden rule 7): an SRD spell's `srdId`, or — for a
 * custom spell, which has no srdId — its user-authored name behind a `custom:`
 * marker. There is NO bare display-name form, so a leak is impossible by design:
 *   • an SRD id resolves through the THROWING resolver (localizes EN/IT; an invalid
 *     id throws in dev/test — the locale-sweep lock catches it — and shows the ⟦…⟧
 *     sentinel in prod, never a silent English string: golden rule 9 / lock 1);
 *   • a `custom:` marker is the user's own name, shown verbatim (nothing to localize).
 *
 * `ThisTurnTracker`, `ResourceRail`, the toast intents, and the combat log all route
 * through this ONE helper, and writers stamp the value via {@link concentrationValue}
 * — so the stored form and its display can never drift (golden rule 6).
 */
export function concentrationLabel(value: string, locale: Locale): string {
  if (!value) return value;
  const customName = customConcentrationName(value);
  if (customName !== null) return customName;
  return localizeSrd("spell", value, "name", locale);
}
