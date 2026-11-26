/**
 * After a Long Rest, a Druid may replace one known Wild Shape form (SRD 5.2.1: «Whenever
 * you finish a Long Rest, you can replace one of your known forms with another eligible
 * form»). The level-up's swap rows: the form to give up, then the eligible beast in its
 * place. The swap counts against the forms the step opened with, so changing the pick
 * never makes a second swap. Pattern source: D&D Beyond's Druid known-forms list and
 * this app's level-up spell swap.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PickGrid } from "@/domains/spells/ui/PickGrid";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import {
  canSwapFormOnRest,
  WILD_SHAPE_ID,
  formSwapOptions,
  storedWildShapeForms,
  swapKnownForm,
} from "@/lib/wild-shape-forms";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

export function PlayFormSwap({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  // The known forms the step opened with, and what they may become.
  const [start] = useState(() => storedWildShapeForms(doc));
  const [options] = useState(() => formSwapOptions(doc).map((b) => b.id));
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  if (!canSwapFormOnRest(doc) || start.length === 0) return null;
  const name = (id: string) => localizeSrd("beasts", id, "name", locale);
  const write = (out: string | null, inn: string | null) => {
    setRemoveId(out);
    setReplaceId(inn);
    const store = useCharacterStore.getState();
    const live = store.character;
    if (!live) return;
    store.setCharacter({
      ...live,
      character: { ...live.character, wildShapeForms: swapKnownForm(start, out, inn) },
    });
  };
  // Its own section on the sheet after the Long Rest, named by the feature.
  const heading = localizeSrd("class-feature", WILD_SHAPE_ID, "name", locale);
  const title = t("play.rest.formSwap");
  const learn = t("levelUp.screen.swapLearn");
  return (
    <section aria-label={heading}>
      <h3 className="f-act-gh">{heading}</h3>
      <div className="f-ask">
        <span className="f-lbl">{title}</span>
        <PickGrid
          label={title}
          options={start.map((id) => ({ id, label: name(id) }))}
          picked={removeId ? [removeId] : []}
          art="monster"
          info="beast"
          count={1}
          locale={locale}
          onToggle={(id) => write(id === removeId ? null : id, null)}
        />
      </div>
      {removeId && (
        <div className="f-ask">
          <span className="f-lbl">{learn}</span>
          <PickGrid
            label={learn}
            options={options.map((id) => ({ id, label: name(id) }))}
            picked={replaceId ? [replaceId] : []}
            art="monster"
            info="beast"
            count={1}
            locale={locale}
            searchLabel={t("polymorph.search")}
            onToggle={(id) => write(removeId, id === replaceId ? null : id)}
          />
        </div>
      )}
    </section>
  );
}
