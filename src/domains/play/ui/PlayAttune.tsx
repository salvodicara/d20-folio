/**
 * Attunement on a Play inventory row: «Sintonizza» or «Termina sintonia», each
 * undoable. When the rules say no (the limit, another copy, an item only some can
 * attune to), the reason in words, and «Sintonizza comunque»: the player may force it.
 */
import { useTranslation } from "react-i18next";

import type { AttuneRefusalView, PlayAttune } from "@/domains/play/play-inventory-view";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { Chip } from "@/ui";

export function PlayAttuneRow({
  attune,
  name,
  locale,
}: {
  attune: PlayAttune;
  name: string;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const run = (attuned: boolean, force?: boolean) =>
    registerUndoableToast(
      {
        message: t(attuned ? "play.inv.attunedToast" : "play.inv.unattunedToast", {
          name,
        }),
      },
      () =>
        useCharacterStore.getState().dispatch(
          attuned
            ? {
                kind: "attune-item",
                instanceId: attune.key,
                ...(force ? { force } : {}),
              }
            : { kind: "unattune-item", instanceId: attune.key }
        ),
      { turnScoped: false }
    );
  if (attune.attuned) {
    return (
      <div className="f-chips">
        <Chip onClick={() => run(false)}>{t("play.inv.unattune")}</Chip>
      </div>
    );
  }
  return (
    <>
      {attune.refusal && (
        <p className="f-help f-attune-why">{refusalText(attune.refusal, t, locale)}</p>
      )}
      {attune.refusal?.reason === "limit" && (
        <p className="f-help f-attune-why">{t("play.inv.refusedLimitHint")}</p>
      )}
      <div className="f-chips">
        <Chip onClick={() => run(true, Boolean(attune.refusal))}>
          {t(attune.refusal ? "play.inv.attuneAnyway" : "equipment.attune")}
        </Chip>
      </div>
    </>
  );
}

function refusalText(
  refusal: AttuneRefusalView,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: Locale
): string {
  const or = new Intl.ListFormat(locale, { type: "disjunction" });
  const and = new Intl.ListFormat(locale, { type: "conjunction" });
  switch (refusal.reason) {
    case "limit":
      return t("play.inv.refusedLimit", {
        limit: refusal.limit,
        names: and.format(refusal.names),
      });
    case "copy":
      return t("play.inv.refusedCopy");
    case "prerequisite":
      return t("play.inv.refusedOnly", {
        who: or.format([
          ...(refusal.spellcaster ? [t("play.inv.spellcasters")] : []),
          ...refusal.names,
          ...(refusal.attunedTo
            ? [t("play.inv.attunedTo", { item: refusal.attunedTo })]
            : []),
        ]),
      });
  }
}
