// The new campaign page (approved prototype camp-*.html, 2026-11-02), behind VITE_NEW_UI.
// It reads the core only: the campaign store, the members' live docs and pure view models.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";

import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { inviteLinkFromCode } from "@/features/campaigns/invite-code";
import { hydrateMemberDoc } from "@/features/campaigns/party-stats";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import {
  useMemberCharacterDocs,
  type MemberCharacterRef,
} from "@/features/campaigns/useMemberCharacterDocs";
import { usePartyCombatStates } from "@/features/campaigns/usePartyCombatStates";
import { useSessionLogMirror } from "@/features/campaigns/useSessionLogMirror";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { asLocale, intlTag, type Locale } from "@/lib/locale";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, HpRing, Panel, Tabs, Toast } from "@/ui";

import { partyRows, type PartyRow } from "../party-rows-view";

type Tab = "party";

export function CampaignScreen() {
  const { campaignId } = useParams();
  if (!campaignId || campaignId === PERSONAL_CAMPAIGN_ID)
    return <Navigate to="/campaigns" replace />;
  return <Campaign campaignId={campaignId} />;
}

function Campaign({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  useCampaignSubscription(campaignId);
  const campaign = useCampaignStore((s) => s.campaign);
  const error = useCampaignStore((s) => s.error);
  const uid = useAuthStore((s) => s.user?.uid);
  // The DM's app writes the fight into the session log; the new page must keep doing it.
  useSessionLogMirror(campaignId, uid, campaign?.dmUid);
  useDocumentTitle(campaign?.name);
  const [tab, setTab] = useState<Tab>("party");
  const [toast, setToast] = useState<string | null>(null);

  if (!campaign || campaign.id !== campaignId) {
    return (
      <div className="fui">
        <main className="f-page">
          <p role="status">
            {t(error ? "campaignScreen.notFound" : "campaignScreen.loading")}
          </p>
        </main>
      </div>
    );
  }

  const copyInvite = () => {
    void navigator.clipboard
      .writeText(inviteLinkFromCode(campaign.inviteCode))
      .then(() => {
        setToast(t("campaignScreen.inviteCopied"));
      });
  };

  return (
    <div className="fui">
      <main className="f-page">
        <Header campaign={campaign} locale={locale} onCopyInvite={copyInvite} />
        <Tabs
          label={t("campaignScreen.tabsLabel")}
          items={[{ id: "party" as const, label: t("campaignHub.party") }]}
          value={tab}
          onChange={setTab}
        />
        <PartyTab campaign={campaign} locale={locale} />
      </main>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function Header({
  campaign,
  locale,
  onCopyInvite,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onCopyInvite: () => void;
}) {
  const { t } = useTranslation();
  const dm = campaign.memberDetails[campaign.dmUid]?.displayName;
  const characters = Object.values(campaign.memberDetails).filter(
    (m) => m.character
  ).length;
  const next = campaign.nextSessionAt
    ? new Date(campaign.nextSessionAt).toLocaleString(intlTag(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <section className="f-hero" data-identity>
      <img
        className="f-crest"
        src={campaign.bannerUrl ?? "/assets/backgrounds/room-war-room.webp"}
        alt=""
      />
      <div className="f-hero-id">
        <h1>{campaign.name}</h1>
        <div className="f-hero-sub">
          {[
            t("roster.count", { count: characters }),
            dm && t("campaignScreen.master", { name: dm }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="f-kv">
          <span className="f-lbl">{t("campaignHub.nextSession")}</span>
          <b>{next ?? t("campaignScreen.noNextSession")}</b>
        </div>
      </div>
      <div className="f-hero-acts">
        <Button icon="u-link" onClick={onCopyInvite}>
          {t("campaignScreen.copyInvite")}
        </Button>
      </div>
    </section>
  );
}

/** Every member's character doc with its live combat state folded in (null while loading). */
function useLiveDocs(campaign: CampaignDoc): Record<string, CharacterDoc | null> {
  const refs = useMemo<MemberCharacterRef[]>(
    () =>
      Object.entries(campaign.memberDetails).flatMap(([uid, m]) =>
        m.characterId ? [{ uid, characterId: m.characterId }] : []
      ),
    [campaign.memberDetails]
  );
  const docs = useMemberCharacterDocs(refs);
  const combat = usePartyCombatStates(refs);
  return useMemo(() => {
    const out: Record<string, CharacterDoc | null> = {};
    for (const { uid } of refs) {
      const st = docs[uid];
      out[uid] = st?.status === "ready" ? hydrateMemberDoc(st.doc, combat[uid]) : null;
    }
    return out;
  }, [refs, docs, combat]);
}

function PartyTab({ campaign, locale }: { campaign: CampaignDoc; locale: Locale }) {
  const { t } = useTranslation();
  const live = useLiveDocs(campaign);
  const rows = partyRows(campaign, live, locale);
  const coins = (["pp", "gp", "ep", "sp", "cp"] as const).filter(
    (c) => campaign.treasury[c] > 0 || c === "gp" || c === "sp" || c === "cp"
  );
  const encounter = campaign.encounter;
  return (
    <div className="f-split">
      <div className="f-stack">
        <Panel
          color="grp"
          title={t("campaignHub.party")}
          aside={rows.length > 0 && t("campaignScreen.partyHint")}
        >
          {rows.length === 0 && (
            <p className="f-note">{t("campaignScreen.noCharacters")}</p>
          )}
          {rows.map((row) => (
            <PartyLine
              key={row.uid}
              row={row}
              href={`/campaigns/${campaign.id}/sheets/${row.uid}`}
            />
          ))}
        </Panel>
        <Panel color="tes" title={t("campaignScreen.chest")}>
          <div className="f-coins">
            {coins.map((c) => (
              <span key={c} className="f-coin" data-coin={c}>
                <b>{campaign.treasury[c]}</b>
                <span className="f-lbl">{t(`equipment.currencyAbbr.${c}`)}</span>
              </span>
            ))}
          </div>
        </Panel>
      </div>
      <Panel color="ini" title={t("campaignScreen.tabFight")}>
        <p>
          {encounter
            ? t("campaignScreen.fightRunning", { round: encounter.round })
            : t("campaignScreen.fightIdle")}
        </p>
      </Panel>
    </div>
  );
}

function PartyLine({ row, href }: { row: PartyRow; href: string }) {
  const { t } = useTranslation();
  const hp = row.hp;
  const share = hp && hp.max > 0 ? hp.current / hp.max : 1;
  return (
    <Link className="f-row" to={href}>
      <HpRing
        hp={hp?.current ?? 0}
        max={hp?.max ?? 0}
        temp={hp?.temp}
        size={48}
        portrait={row.portraitUrl ?? undefined}
      />
      <div className="f-row-main">
        <div className="f-row-t">{row.name}</div>
        <div className="f-row-s">
          {[row.classLine, row.player].filter(Boolean).join(" · ")}
        </div>
      </div>
      {row.chips.length > 0 && (
        <div className="f-chips">
          {row.chips.map((c) => (
            <Chip key={c.kind + c.label} kind={c.kind}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="f-row-end">
        <Stat
          value={hp ? `${hp.current}/${hp.max}` : "—"}
          label={t("units.hp")}
          hp={hp ? (share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad") : undefined}
        />
        <Stat value={row.ac ?? "—"} label={t("stats.ac")} />
        <Stat value={row.perception ?? "—"} label={t("skills.perception")} />
      </div>
    </Link>
  );
}

function Stat({
  value,
  label,
  hp,
}: {
  value: string | number;
  label: string;
  hp?: "ok" | "low" | "bad";
}) {
  return (
    <div className="f-stat">
      <div className="f-stat-v" data-hp={hp}>
        {value}
      </div>
      <div className="f-lbl">{label}</div>
    </div>
  );
}
