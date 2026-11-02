import { useMemo } from "react";

import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { SessionReportNames } from "@/lib/views/session-report-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import type { CampaignDoc } from "@/types/campaign";

/** How the report names people, conditions, spells and sources, in the reader's language. */
export function useReportNames(
  campaign: CampaignDoc,
  locale: Locale
): SessionReportNames {
  return useMemo(
    () => ({
      pc: (id) => {
        const member = campaign.memberDetails[id.replace(/^pc-/, "")];
        return member?.character?.name || member?.displayName || undefined;
      },
      condition: (id) =>
        hasSrd("condition", id, "name", locale)
          ? localizeSrd("condition", id, "name", locale)
          : id,
      action: (text) => localizeText(text, locale),
      spell: (ref) => concentrationLabel(ref, locale),
      source: (id) => grantSourceLabel(id, locale),
      locale,
    }),
    [campaign.memberDetails, locale]
  );
}
