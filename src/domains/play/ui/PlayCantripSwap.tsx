/**
 * After a Long Rest, a cantrip the lineage lets you replace (High Elf: «Whenever you
 * finish a Long Rest, you can replace that cantrip with a different cantrip from the
 * Wizard spell list»): one line per swap, the cantrip now pressed, the others to tap.
 * The pick is stored as the session's option choice (`applyRestCantripSwap`).
 */
import { useTranslation } from "react-i18next";

import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { applyRestCantripSwap, restCantripSwaps } from "@/lib/rest-cantrip-swap";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Chip } from "@/ui";

export function PlayCantripSwap({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const live = useCharacterStore((s) => s.character) ?? doc;
  const rows = restCantripSwaps(live);
  if (rows.length === 0) return null;
  const name = (id: string) => localizeSrd("spell", id, "name", locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const swap = (choiceKey: string, spellId: string) => {
    const store = useCharacterStore.getState();
    const now = store.character;
    if (now) store.setCharacter(applyRestCantripSwap(now, choiceKey, spellId));
  };
  return (
    <>
      {rows.map((row) => (
        <div key={row.choiceKey} className="f-ask">
          <span className="f-lbl">
            {t("play.rest.cantripSwap", {
              source: grantSourceLabel(row.sourceId, locale),
            })}
          </span>
          <div
            className="f-chips"
            role="group"
            aria-label={t("play.rest.cantripSwap", {
              source: grantSourceLabel(row.sourceId, locale),
            })}
          >
            {[row.current, ...row.options]
              .sort((a, b) => collator.compare(name(a), name(b)))
              .map((id) => (
                <Chip
                  key={id}
                  pressed={id === row.current}
                  onClick={() => swap(row.choiceKey, id)}
                >
                  {name(id)}
                </Chip>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
