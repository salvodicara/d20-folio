import { useMemo } from "react";

import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { SessionReportNames } from "@/lib/views/session-report-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { concentrationLabel } from "@/lib/views/concentration-label";
import type { CampaignDoc } from "@/types/campaign";

function namesWith(
  pc: (id: string) => string | undefined,
  locale: Locale
): SessionReportNames {
  return {
    pc,
    condition: (id) =>
      hasSrd("condition", id, "name", locale)
        ? localizeSrd("condition", id, "name", locale)
        : id,
    action: (text) => localizeText(text, locale),
    spell: (ref) => concentrationLabel(ref, locale),
    source: (id) => grantSourceLabel(id, locale),
    locale,
  };
}

/** A character's own report (no campaign): every `pc-…` is the character itself; any
 *  other creature is not, so a cast on a monster never reads as cast on the caster. */
export function useOwnReportNames(name: string, locale: Locale): SessionReportNames {
  return useMemo(
    () =>
      namesWith((id) => (id.startsWith("pc-") ? name || undefined : undefined), locale),
    [name, locale]
  );
}

/** How the report names people, conditions, spells and sources, in the reader's language. */
export function useReportNames(
  campaign: CampaignDoc,
  locale: Locale,
  /** The party's names as Gruppo shows them (`usePartyNames`): one name per character. */
  party: Readonly<Record<string, string>>
): SessionReportNames {
  return useMemo(
    () =>
      namesWith((id) => {
        const uid = id.replace(/^pc-/, "");
        const member = campaign.memberDetails[uid];
        return party[uid] || member?.character?.name || member?.displayName || undefined;
      }, locale),
    [campaign.memberDetails, locale, party]
  );
}
